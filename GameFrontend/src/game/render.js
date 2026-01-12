/**
 * Canvas rendering for the game model.
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./engine').createInitialGameModel extends (...args:any)=>infer R ? R : any} model
 * @param {{showDebug?: boolean, swipePoints?: Array<{x:number,y:number,t:number}>}} opts
 */
export function renderGame(ctx, model, opts = {}) {
  const { width: w, height: h } = model.config;
  const showDebug = Boolean(opts.showDebug);

  // Background
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h);

  // Entities
  for (const e of model.entities) {
    if (e.type === "bomb") {
      drawBomb(ctx, e);
    } else {
      drawFruit(ctx, e);
    }
  }

  // Effects (slash flashes)
  if (Array.isArray(model.effects)) {
    drawEffects(ctx, model.effects, performance.now());
  }

  // Swipe path overlay: always show subtle fading stroke for player feedback.
  if (Array.isArray(opts.swipePoints)) {
    drawSwipeStroke(ctx, opts.swipePoints, performance.now(), { strong: showDebug });
  }

  // HUD
  drawHud(ctx, model, w, h);

  if (showDebug) {
    drawDebug(ctx, model, w, h);
  }
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0B1020");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // subtle stars / particles
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#FFFFFF";
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % w;
    const y = (i * 53) % h;
    ctx.beginPath();
    ctx.arc(x, y, (i % 3) + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFruit(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rotation);

  // fruit body
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fill();

  // highlight
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-e.radius * 0.25, -e.radius * 0.35, e.radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // outline
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawBomb(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rotation);

  // body
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
  ctx.fill();

  // fuse
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(e.radius * 0.2, -e.radius * 0.9);
  ctx.quadraticCurveTo(e.radius * 0.9, -e.radius * 1.4, e.radius * 1.2, -e.radius * 0.6);
  ctx.stroke();

  // shine
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-e.radius * 0.3, -e.radius * 0.35, e.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // skull-ish marking
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.arc(0, 0, e.radius * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(-e.radius * 0.14, -e.radius * 0.05, e.radius * 0.11, 0, Math.PI * 2);
  ctx.arc(e.radius * 0.14, -e.radius * 0.05, e.radius * 0.11, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHud(ctx, model, w, h) {
  ctx.save();

  // Top gradient bar
  const barH = 48;
  const grad = ctx.createLinearGradient(0, 0, 0, barH);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, barH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.textBaseline = "middle";

  const seconds = Math.floor(model.elapsedMs / 1000);

  ctx.fillText(`Score: ${model.score}`, 14, barH / 2);
  ctx.fillText(`Lives: ${model.lives}`, 140, barH / 2);
  ctx.fillText(`Time: ${seconds}s`, 250, barH / 2);

  // Phase overlay text (minimal)
  if (model.phase === "idle") {
    drawCenteredText(ctx, w, h, "Ready", "Press Start");
  } else if (model.phase === "gameOver") {
    drawCenteredText(ctx, w, h, "Game Over", "Returning to results…");
  }

  ctx.restore();
}

function drawCenteredText(ctx, w, h, title, subtitle) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "700 36px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(title, w / 2, h * 0.42);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "500 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(subtitle, w / 2, h * 0.42 + 34);
  ctx.restore();
}

function drawSwipeStroke(ctx, points, nowMs, opts = {}) {
  if (!points || points.length < 2) return;

  // Fade based on age; use a slightly longer fade window than capture maxAge for smoothness.
  const fadeWindowMs = 200;

  const pts = points
    .filter((p) => p && typeof p.x === "number" && typeof p.y === "number" && typeof p.t === "number")
    .slice(-32);

  if (pts.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Slight glow.
  ctx.shadowColor = "rgba(147,197,253,0.55)";
  ctx.shadowBlur = opts.strong ? 10 : 6;

  // Draw per-segment so each segment can fade with its own age.
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];

    const age = nowMs - b.t;
    const alpha = 1 - Math.min(1, Math.max(0, age / fadeWindowMs));
    if (alpha <= 0.02) continue;

    ctx.strokeStyle = `rgba(96,165,250,${0.55 * alpha})`;
    ctx.lineWidth = 4.5 * (0.55 + 0.45 * alpha);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // inner brighter core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,${0.28 * alpha})`;
    ctx.lineWidth = 2.0 * (0.7 + 0.3 * alpha);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.shadowBlur = opts.strong ? 10 : 6;
  }

  ctx.restore();
}

function drawEffects(ctx, effects, nowMs) {
  for (const fx of effects) {
    if (!fx || fx.type !== "slash" || !Array.isArray(fx.points)) continue;

    const ttl = typeof fx.ttlMs === "number" ? fx.ttlMs : 120;
    const age = nowMs - fx.bornAtMs;
    const alpha = 1 - Math.min(1, Math.max(0, age / ttl));
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = 0.9 * alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = 6;

    ctx.beginPath();
    ctx.moveTo(fx.points[0].x, fx.points[0].y);
    for (let i = 1; i < fx.points.length; i++) ctx.lineTo(fx.points[i].x, fx.points[i].y);
    ctx.stroke();

    ctx.globalAlpha = 0.35 * alpha;
    ctx.strokeStyle = "rgba(96,165,250,1)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(fx.points[0].x, fx.points[0].y);
    for (let i = 1; i < fx.points.length; i++) ctx.lineTo(fx.points[i].x, fx.points[i].y);
    ctx.stroke();

    ctx.restore();
  }
}

function drawDebug(ctx, model, w, h) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(w - 180, 8, 172, 92);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.textBaseline = "top";

  const lines = [
    `phase: ${model.phase}`,
    `entities: ${model.entities.length}`,
    `effects: ${(model.effects || []).length}`,
    `spawn(ms): ${model.config.spawnIntervalMs}`,
    `gravity: ${model.config.gravityPxPerS2}`
  ];
  lines.forEach((l, i) => ctx.fillText(l, w - 170, 12 + i * 16));

  ctx.restore();
}
