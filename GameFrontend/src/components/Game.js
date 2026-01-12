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
export default function Game({ onGameOver, onExit }) {
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

  // This is a UI-only acknowledgement that the player saw "Game Over".
  // It prevents double-firing parent navigation / results.
  const [gameOverHandled, setGameOverHandled] = useState(false);

  const rafRef = useRef(0);
  const lastRef = useRef(performance.now());

  // Keep a small, recent swipe trail for segment intersection checks + rendering.
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

  const hardPause = () => {
    // Called when we must ensure sim is paused (pause overlay / game over / leaving tab).
    setRunning(false);
  };

  // Auto-pause on tab switch to avoid accidental loss.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hardPause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

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

      // Read points once per frame for consistent sim + render.
      const points = swipe.getPoints();

      setModel((prev) => {
        // Advance sim only when running.
        const stepped = running ? stepGame(prev, dtMs, now, { rand }) : prev;

        // Apply slicing while swiping using segment-vs-circle intersection.
        const sliced = running ? sliceAtPoints(stepped, points, now) : stepped;

        // If game is over, stop sim (but do not auto-navigate away; show overlay).
        if (prev.phase !== "gameOver" && sliced.phase === "gameOver") {
          swipe.clearPoints();
          setRunning(false);
        }

        return sliced;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [rand, running, swipe]);

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

    // Always draw swipe feedback; in debug also keep extra overlays.
    renderGame(ctx, model, {
      showDebug: debugEnabled,
      swipePoints: swipe.getPoints()
    });
  }, [debugEnabled, model, size.height, size.width, swipe]);

  const handleStart = () => {
    const now = performance.now();
    swipe.clearPoints();
    setGameOverHandled(false);
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
    // Only allow pausing/resuming during active running phase.
    if (model.phase !== "running") return;
    setRunning((r) => !r);
  };

  const handleExit = () => {
    hardPause();
    if (typeof onExit === "function") onExit();
  };

  const handleShowResults = () => {
    if (gameOverHandled) return;
    setGameOverHandled(true);

    if (typeof onGameOver === "function") {
      const payload = {
        score: model.score,
        elapsedMs: model.elapsedMs
      };
      onGameOver(payload);
    }
  };

  const isPaused = model.phase === "running" && !running;
  const showInGameActions = model.phase === "running";
  const isGameOver = model.phase === "gameOver";

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
          {model.phase === "idle" && (
            <button className="btn btn-primary" onClick={handleStart}>
              Start
            </button>
          )}

          {showInGameActions && (
            <>
              <button className="btn btn-secondary" onClick={handlePauseToggle}>
                {running ? "Pause" : "Resume"}
              </button>
              <button className="btn" onClick={handleExit}>
                Exit
              </button>
            </>
          )}

          {isGameOver && (
            <>
              <button className="btn btn-primary" onClick={handleStart}>
                Restart
              </button>
              <button className="btn btn-secondary" onClick={handleShowResults}>
                Results
              </button>
            </>
          )}
        </div>
      </div>

      <div className="gameCanvasShell" ref={containerRef}>
        <canvas ref={canvasRef} className="gameCanvas" role="application" aria-label="Fruit Ninja canvas game" />

        {isPaused && (
          <div className="gameOverlay" role="dialog" aria-label="Paused overlay">
            <div className="gameOverlayCard">
              <div className="gameOverlayTitle">Paused</div>
              <div className="gameOverlaySub">Resume when ready. Tip: quick swipes work best.</div>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => setRunning(true)}>
                  Resume
                </button>
                <button className="btn btn-secondary" onClick={handleExit}>
                  Exit to Home
                </button>
              </div>
            </div>
          </div>
        )}

        {model.phase === "idle" && (
          <div className="gameOverlay" role="dialog" aria-label="Start overlay">
            <div className="gameOverlayCard">
              <div className="gameOverlayTitle">Fruit Ninja Online</div>
              <div className="gameOverlaySub">Swipe across the canvas to slice fruits. Avoid bombs.</div>
              <div className="actions">
                <button className="btn btn-primary" onClick={handleStart}>
                  Start Solo
                </button>
                <button className="btn btn-secondary" onClick={handleExit}>
                  Back Home
                </button>
              </div>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="gameOverlay" role="dialog" aria-label="Game over overlay">
            <div className="gameOverlayCard">
              <div className="gameOverlayTitle">Game Over</div>
              <div className="gameOverlaySub">
                Final score: <strong>{model.score}</strong> • Time: <strong>{formatMs(model.elapsedMs)}</strong>
              </div>
              <div className="actions">
                <button className="btn btn-primary" onClick={handleStart}>
                  Restart
                </button>
                <button className="btn btn-secondary" onClick={handleShowResults}>
                  View Results
                </button>
                <button className="btn" onClick={handleExit}>
                  Exit
                </button>
              </div>
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
