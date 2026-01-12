import React from "react";

// PUBLIC_INTERFACE
export default function HomeScreen({ onStartSolo }) {
  /** Home screen: entry point to start a solo game. */
  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Fruit Ninja Online</h1>
        <p className="subtitle">
          Solo mode is available now. Multiplayer will appear once backend services are connected.
        </p>

        <div className="actions">
          <button className="btn btn-primary btn-large" onClick={onStartSolo}>
            Start Solo Game
          </button>
        </div>

        <div className="finePrint">
          <p>
            Tip: Use mouse drag on desktop or swipe on touch devices.
          </p>
        </div>
      </div>
    </div>
  );
}
