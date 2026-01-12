import React from "react";

// PUBLIC_INTERFACE
export default function MultiplayerScreen({ onBackHome }) {
  /** Multiplayer placeholder screen: will later host matchmaking/lobby + realtime gameplay. */
  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Multiplayer</h1>
        <p className="subtitle">
          This is a placeholder screen for the upcoming real-time mode. Next steps will include matchmaking, room/lobby,
          and WebSocket state sync.
        </p>

        <div className="resultsGrid" aria-label="Multiplayer status">
          <div className="resultItem">
            <div className="resultLabel">Status</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              Coming soon
            </div>
          </div>
          <div className="resultItem">
            <div className="resultLabel">Planned</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              Lobby • Match • Live score
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary btn-large" onClick={onBackHome}>
            Back Home
          </button>
        </div>

        <div className="finePrint">
          <p className="muted">
            Env hooks available: <code>REACT_APP_WS_URL</code>, <code>REACT_APP_BACKEND_URL</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
