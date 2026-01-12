/**
 * Slicing helpers: geometry + entity slicing resolution.
 * Intentionally framework-agnostic for easy unit testing.
 */

/**
 * @typedef {{x:number,y:number,t:number}} SwipePoint
 */

/**
 * @typedef {{id:string,type:'fruit'|'bomb',x:number,y:number,radius:number}} SliceableEntity
 */

/**
 * @typedef {{
 *   phase: 'idle'|'running'|'gameOver',
 *   score: number,
 *   lives: number,
 *   startTimeMs: number,
 *   elapsedMs: number,
 *   entities: Array<any>,
 *   config: any,
 *   effects?: Array<any>
 * }} GameModelLike
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Compute squared distance from point P to segment AB.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function distPointToSegmentSq(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-9) {
    // A and B are essentially the same point.
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return dx * dx + dy * dy;
  }

  // Project AP onto AB, parameterized by t in [0,1].
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;

  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy;
}

// PUBLIC_INTERFACE
export function segmentIntersectsCircle(a, b, c, r) {
  /**
   * Returns true if line segment AB intersects (or touches) circle centered at C with radius r.
   *
   * This is used for Fruit Ninja-style slicing: each swipe segment is tested against each entity.
   *
   * @param {{x:number,y:number}} a Segment start
   * @param {{x:number,y:number}} b Segment end
   * @param {{x:number,y:number}} c Circle center
   * @param {number} r Circle radius
   * @returns {boolean}
   */
  if (!a || !b || !c) return false;
  if (!(r >= 0)) return false;
  const d2 = distPointToSegmentSq(c, a, b);
  return d2 <= r * r;
}

function isValidSwipePoint(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.t);
}

/**
 * Create a quick "slash" effect entry for renderer.
 * Kept intentionally simple: a polyline + timestamp for fading.
 */
function makeSlashEffect(swipeTrail, nowMs) {
  const pts = swipeTrail
    .filter(isValidSwipePoint)
    .slice(-10)
    .map((p) => ({ x: p.x, y: p.y }));

  if (pts.length < 2) return null;

  return {
    id: `slash-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    type: "slash",
    bornAtMs: nowMs,
    ttlMs: 140,
    points: pts
  };
}

// PUBLIC_INTERFACE
export function sliceEntities(state, swipeTrail, nowMs) {
  /**
   * Apply slicing based on swipeTrail and return updated state.
   *
   * Mechanics:
   * - Check each swipe segment against each entity circle.
   * - Fruit hit => +1 score and remove entity
   * - Bomb hit => phase -> gameOver and remove bomb (optional; keeps screen clean)
   * - Adds a short-lived slash effect to state.effects for renderer feedback.
   *
   * Performance:
   * - Operates only on active entities in state.entities.
   * - Uses the bounded swipeTrail already capped by useSwipeInput.
   *
   * @param {GameModelLike} state
   * @param {SwipePoint[]} swipeTrail
   * @param {number} nowMs
   * @returns {GameModelLike}
   */
  if (!state || state.phase !== "running") return state;
  if (!Array.isArray(swipeTrail) || swipeTrail.length < 2) return state;

  // Build segments from the (already recent) swipe points.
  const pts = swipeTrail.filter(isValidSwipePoint);
  if (pts.length < 2) return state;

  const slicedIds = new Set();
  let bombHit = false;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];

    // Skip degenerate tiny moves.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy < 0.5) continue;

    for (const e of state.entities || []) {
      if (!e || slicedIds.has(e.id)) continue;

      if (segmentIntersectsCircle(a, b, { x: e.x, y: e.y }, e.radius)) {
        slicedIds.add(e.id);
        if (e.type === "bomb") bombHit = true;
      }
    }
  }

  if (slicedIds.size === 0) return state;

  let score = state.score;
  const remaining = [];
  for (const e of state.entities || []) {
    if (!slicedIds.has(e.id)) {
      remaining.push(e);
      continue;
    }
    if (e.type === "fruit") score += 1;
  }

  const slash = makeSlashEffect(pts, nowMs);
  const existingEffects = Array.isArray(state.effects) ? state.effects : [];
  const nextEffects = slash ? [...existingEffects, slash] : existingEffects;

  return {
    ...state,
    score,
    entities: remaining,
    phase: bombHit ? "gameOver" : state.phase,
    elapsedMs: Math.max(0, nowMs - state.startTimeMs),
    effects: nextEffects
  };
}
