import React, { useEffect, useState } from "react";
import { apiClient } from "../api/restClient";
import LeaderboardPreview from "./LeaderboardPreview";

// PUBLIC_INTERFACE
export default function HomeScreen({ onStartSolo, onStartMultiplayer, onViewLeaderboard }) {
  /** Home screen: entry point to start solo, or go to multiplayer placeholder, and show leaderboard preview. */

  const [backend, setBackend] = useState(() => ({ loading: true, mode: "offline", isMock: true }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const h = await apiClient.health();
        if (cancelled) return;
        setBackend({ loading: false, ...(h || { mode: "offline", isMock: true }) });
      } catch (e) {
        if (cancelled) return;
        setBackend({ loading: false, mode: "offline", isMock: true, error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = backend?.loading
    ? "Checking backend…"
    : backend?.mode === "remote"
      ? `Online (${backend.latencyMs ?? 0}ms)`
      : "Offline (mock)";

  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Fruit Ninja Online</h1>
        <p className="subtitle">Choose a mode. Solo is playable now; Multiplayer is a placeholder UI for upcoming backend.</p>

        <div className="resultsGrid" aria-label="Connectivity and leaderboard preview">
          <div className="resultItem">
            <div className="resultLabel">Backend</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              {statusText}
            </div>
          </div>

          <div className="resultItem">
            <LeaderboardPreview
              limit={5}
              onViewFull={() => {
                if (typeof onViewLeaderboard === "function") onViewLeaderboard();
              }}
            />
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary btn-large" onClick={onStartSolo}>
            Start Solo Game
          </button>
          <button className="btn btn-secondary btn-large" onClick={onStartMultiplayer}>
            Multiplayer (Coming Soon)
          </button>
        </div>

        <div className="finePrint">
          <p>Tip: Use mouse drag on desktop or swipe on touch devices.</p>
          <p className="muted" style={{ marginTop: 8 }}>
            API base is env-driven via <code>REACT_APP_API_BASE</code> (preferred) / <code>REACT_APP_BACKEND_URL</code>{" "}
            (fallback). If unset, the app runs in mock mode.
          </p>
        </div>
      </div>
    </div>
  );
}
