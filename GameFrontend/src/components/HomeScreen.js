import React from "react";

// PUBLIC_INTERFACE
export default function HomeScreen({ onStartSolo, onStartMultiplayer }) {
  /** Home screen: entry point to start solo, or go to multiplayer placeholder. */
  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Fruit Ninja Online</h1>
        <p className="subtitle">Choose a mode. Solo is playable now; Multiplayer is a placeholder UI for upcoming backend.</p>

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
        </div>
      </div>
    </div>
  );
}
