import React from "react";

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// PUBLIC_INTERFACE
export default function ResultsScreen({ results, onPlayAgain, onBackHome }) {
  /** Results screen: shows score and duration, offers play again. */
  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Results</h1>
        <p className="subtitle">Nice run. Keep slicing.</p>

        <div className="resultsGrid" aria-label="Game results">
          <div className="resultItem">
            <div className="resultLabel">Score</div>
            <div className="resultValue">{results?.score ?? 0}</div>
          </div>
          <div className="resultItem">
            <div className="resultLabel">Time</div>
            <div className="resultValue">{formatMs(results?.elapsedMs ?? 0)}</div>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary btn-large" onClick={onPlayAgain}>
            Play Again
          </button>
          <button className="btn btn-secondary" onClick={onBackHome}>
            Back Home
          </button>
        </div>

        <div className="finePrint">
          <p>No backend calls are made yet; this is graceful offline mode.</p>
        </div>
      </div>
    </div>
  );
}
