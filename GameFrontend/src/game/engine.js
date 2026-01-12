// Core, self-contained game engine (no network calls).
// Provides: entity update/spawn logic + simulation step.
//
// Intentionally framework-agnostic so it can be tested/used from React.
//

import { sliceEntities } from "./slicing";

/**
 * @typedef {'fruit'|'bomb'} EntityType
 */

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {EntityType} type
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} radius
 * @property {number} rotation
 * @property {number} rotationSpeed
 * @property {string} color
 * @property {number} bornAtMs
 */

/**
 * @typedef {Object} GameConfig
 * @property {number} gravityPxPerS2
 * @property {number} spawnIntervalMs
 * @property {number} bombProbability 0..1
 * @property {number} maxLives
 * @property {number} missPenaltyLives
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {'idle'|'running'|'gameOver'} GamePhase
 */

/**
 * @typedef {Object} GameModel
 * @property {GamePhase} phase
 * @property {number} score
 * @property {number} lives
 * @property {number} startTimeMs
 * @property {number} elapsedMs
 * @property {Entity[]} entities
 * @property {number} lastSpawnAtMs
 * @property {GameConfig} config
 * @property {Array<any>} [effects]
 */

const DEFAULT_CONFIG = Object.freeze({
  gravityPxPerS2: 1600,
  spawnIntervalMs: 700,
  bombProbability: 0.16,
  maxLives: 3,
  missPenaltyLives: 1,
  width: 800,
  height: 500
});

function mulberry32(seed) {
  // Small deterministic PRNG for repeatability/debug if desired.
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randomBetween(rand, a, b) {
  return a + (b - a) * rand();
}

function newId() {
  // Good enough for runtime entity IDs.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function pickFruitColor(rand) {
  const palette = [
    "#FF4D4D", // apple-ish
    "#FFA94D", // orange-ish
    "#FFD43B", // lemon-ish
    "#69DB7C", // melon-ish
    "#4DABF7", // blueberry-ish
    "#B197FC" // grape-ish
  ];
  return palette[Math.floor(rand() * palette.length)];
}

// PUBLIC_INTERFACE
export function createInitialGameModel(options = {}) {
  /** Create a new game model instance. */
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : performance.now();

  const config = {
    ...DEFAULT_CONFIG,
    ...(options.config || {})
  };

  return {
    phase: "idle",
    score: 0,
    lives: config.maxLives,
    startTimeMs: 0,
    elapsedMs: 0,
    entities: [],
    lastSpawnAtMs: nowMs,
    config,
    effects: []
  };
}

// PUBLIC_INTERFACE
export function startGame(model, nowMs = performance.now()) {
  /** Transition model into running phase and reset counters. */
  return {
    ...model,
    phase: "running",
    score: 0,
    lives: model.config.maxLives,
    startTimeMs: nowMs,
    elapsedMs: 0,
    entities: [],
    lastSpawnAtMs: nowMs,
    effects: []
  };
}

// PUBLIC_INTERFACE
export function stepGame(model, dtMs, nowMs, options = {}) {
  /**
   * Advance simulation by dtMs.
   * Returns a new model (immutable-style) for easier React integration.
   */
  if (model.phase !== "running") return model;

  const rand = options.rand || Math.random;
  const dtS = dtMs / 1000;

  // Update elapsed.
  let next = {
    ...model,
    elapsedMs: Math.max(0, nowMs - model.startTimeMs)
  };

  // Spawn.
  if (nowMs - next.lastSpawnAtMs >= next.config.spawnIntervalMs) {
    next = spawnEntity(next, nowMs, rand);
  }

  // Physics update.
  const g = next.config.gravityPxPerS2;
  const w = next.config.width;
  const h = next.config.height;

  let lives = next.lives;
  const entities = [];

  for (const e of next.entities) {
    const vx = e.vx;
    const vy = e.vy + g * dtS;

    const x = e.x + vx * dtS;
    const y = e.y + vy * dtS;

    const rotation = e.rotation + e.rotationSpeed * dtS;

    // Cull when far below bottom
    const out = y - e.radius > h + 80;

    if (out) {
      if (e.type === "fruit") {
        lives = clamp(lives - next.config.missPenaltyLives, 0, next.config.maxLives);
      }
      continue;
    }

    // Very light wall bounds to keep objects visible early in flight.
    const clampedX = clamp(x, -50, w + 50);

    entities.push({
      ...e,
      x: clampedX,
      y,
      vx,
      vy,
      rotation
    });
  }

  // Update + prune effects (e.g., slash flashes).
  const effects = Array.isArray(next.effects) ? next.effects : [];
  const prunedEffects = effects.filter((fx) => {
    if (!fx || typeof fx.bornAtMs !== "number") return false;
    const ttl = typeof fx.ttlMs === "number" ? fx.ttlMs : 0;
    return nowMs - fx.bornAtMs <= ttl;
  });

  next = { ...next, entities, lives, effects: prunedEffects };

  // End condition.
  if (next.lives <= 0) {
    return { ...next, phase: "gameOver" };
  }

  return next;
}

function spawnEntity(model, nowMs, rand) {
  const { width: w, height: h } = model.config;

  // Spawn from slightly below bottom; shoot upward.
  const x = randomBetween(rand, w * 0.15, w * 0.85);
  const y = h + randomBetween(rand, 20, 60);

  const vx = randomBetween(rand, -220, 220);
  const vy = randomBetween(rand, -1200, -850);

  const radius = randomBetween(rand, 18, 32);

  const isBomb = rand() < model.config.bombProbability;

  const entity = {
    id: newId(),
    type: isBomb ? "bomb" : "fruit",
    x,
    y,
    vx,
    vy,
    radius,
    rotation: randomBetween(rand, 0, Math.PI * 2),
    rotationSpeed: randomBetween(rand, -4.5, 4.5),
    color: isBomb ? "#1F2937" : pickFruitColor(rand),
    bornAtMs: nowMs
  };

  return {
    ...model,
    entities: [...model.entities, entity],
    lastSpawnAtMs: nowMs
  };
}

// PUBLIC_INTERFACE
export function getDeterministicRand(seed = 123456) {
  /** Get a deterministic random function useful for debugging. */
  return mulberry32(seed);
}

// PUBLIC_INTERFACE
export function sliceAtPoints(model, points, nowMs = performance.now()) {
  /**
   * Apply slicing from the recent swipe trail using line-segment vs circle tests.
   * Delegates to sliceEntities(), kept here for backwards compatibility with Game.js imports.
   */
  return sliceEntities(model, points, nowMs);
}
