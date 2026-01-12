import React, { useEffect, useMemo, useRef, useState } from "react";
import { createInitialGameModel, getDeterministicRand, sliceAtPoints, startGame, stepGame } from "../game/engine";
import { renderGame } from "../game/render";
import { useSwipeInput } from "../game/useSwipeInput";

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// PUBLIC_INTERFACE
export default function Game({ onGameOver }) {
  /** Canvas game component: handles render loop, input capture, and local game state. */
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Keep config in state to support responsive resize.
  const [size, setSize] = useState({ width: 900, height: 560 });

  const debugEnabled = String(process.env.REACT_APP_NODE_ENV || "").toLowerCase() === "development";

  const rand = useMemo(() => {
    // Deterministic in debug so motion feels stable.
    return debugEnabled ? getDeterministicRand(1337) : Math.random;
  }, [debugEnabled]);

  const [model, setModel] = useState(() =>
    createInitialGameModel({
      config: {
        width: size.width,
        height: size.height
      }
    })
  );

  const [running, setRunning] = useState(false);

  const rafRef = useRef(0);
  const lastRef = useRef(performance.now());

  const swipe = useSwipeInput(canvasRef, { maxPoints: 28, maxAgeMs: 160 });

  // Responsive sizing: fit to container while keeping a nice aspect.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.floor(rect.height));
      setSize({ width: w, height: h });
    };

    compute();

    const ro = new ResizeObserver(compute);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // When size changes, update model config (preserve game state).
  useEffect(() => {
    setModel((m) => ({
      ...m,
      config: { ...m.config, width: size.width, height: size.height }
    }));
  }, [size.width, size.height]);

  // Main RAF loop (start/pause/cleanup).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mounted = true;

    const loop = (now) => {
      if (!mounted) return;

      const dtMs = Math.min(40, Math.max(0, now - lastRef.current));
      lastRef.current = now;

      setModel((prev) => {
        // Advance sim only when running.
        const stepped = running ? stepGame(prev, dtMs, now, { rand }) : prev;

        // Apply simple slicing while swiping (placeholder hit logic).
        const points = swipe.getPoints();
        const sliced = running ? sliceAtPoints(stepped, points, now) : stepped;

        // If game is over, stop loop and notify parent (after render).
        if (prev.phase !== "gameOver" && sliced.phase === "gameOver") {
          // Stop input points to avoid accidental extra hits.
          swipe.clearPoints();
          setRunning(false);

          // Notify parent with results.
          if (typeof onGameOver === "function") {
            const payload = {
              score: sliced.score,
              elapsedMs: sliced.elapsedMs
            };
            // Defer to allow React state to commit cleanly.
            setTimeout(() => onGameOver(payload), 0);
          }
        }

        return sliced;
      });

      // Render: always paint latest model snapshot from state in a separate read.
      // We'll re-render using the current React state value in a follow-up effect.
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [onGameOver, rand, running, swipe]);

  // Render whenever model changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas backing store matches CSS size for crisp rendering.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderGame(ctx, model, { showDebug: debugEnabled, swipePoints: debugEnabled ? swipe.getPoints() : undefined });
  }, [debugEnabled, model, size.height, size.width, swipe]);

  const handleStart = () => {
    const now = performance.now();
    swipe.clearPoints();
    setModel((m) =>
      startGame(
        {
          ...m,
          config: { ...m.config, width: size.width, height: size.height }
        },
        now
      )
    );
    lastRef.current = now;
    setRunning(true);
  };

  const handlePauseToggle = () => {
    if (model.phase !== "running") return;
    setRunning((r) => !r);
  };

  return (
    <div className="gameRoot">
      <div className="gameTopBar">
        <div className="gameStat">
          <span className="gameStatLabel">Score</span>
          <span className="gameStatValue">{model.score}</span>
        </div>
        <div className="gameStat">
          <span className="gameStatLabel">Lives</span>
          <span className="gameStatValue">{model.lives}</span>
        </div>
        <div className="gameStat">
          <span className="gameStatLabel">Time</span>
          <span className="gameStatValue">{formatMs(model.elapsedMs)}</span>
        </div>

        <div className="gameTopActions">
          {model.phase !== "running" ? (
            <button className="btn btn-primary" onClick={handleStart}>
              Start
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handlePauseToggle}>
              {running ? "Pause" : "Resume"}
            </button>
          )}
        </div>
      </div>

      <div className="gameCanvasShell" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="gameCanvas"
          role="application"
          aria-label="Fruit Ninja canvas game"
        />
        {!running && model.phase === "running" && (
          <div className="gameOverlay">
            <div className="gameOverlayCard">
              <div className="gameOverlayTitle">Paused</div>
              <div className="gameOverlaySub">Swipe to slice fruits; avoid bombs.</div>
              <button className="btn btn-primary" onClick={() => setRunning(true)}>
                Resume
              </button>
            </div>
          </div>
        )}
        {model.phase === "idle" && (
          <div className="gameOverlay">
            <div className="gameOverlayCard">
              <div className="gameOverlayTitle">Fruit Ninja Online</div>
              <div className="gameOverlaySub">Swipe across the canvas to slice.</div>
              <button className="btn btn-primary" onClick={handleStart}>
                Start Solo
              </button>
            </div>
          </div>
        )}
      </div>

      {debugEnabled && (
        <div className="debugNote">
          Debug overlays enabled via <code>REACT_APP_NODE_ENV=development</code>.
        </div>
      )}
    </div>
  );
}
