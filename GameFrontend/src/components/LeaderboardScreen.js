import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/restClient";
import { formatScoreDate, normalizeScoreRow } from "./leaderboardUtils";

/**
 * Leaderboard screen: fetches and displays a full list of top scores.
 */

// PUBLIC_INTERFACE
export default function LeaderboardScreen({ onBack }) {
  /** Full leaderboard screen with non-fatal REST usage and graceful offline fallback. */
  const [state, setState] = useState(() => ({
    loading: true,
    error: null,
    rows: []
  }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await apiClient.getTopScores();
        if (cancelled) return;

        const rows = Array.isArray(res) ? res.map(normalizeScoreRow) : [];
        setState({ loading: false, error: null, rows });
      } catch (e) {
        // getTopScores() already falls back to mock scores, but keep defensive.
        if (cancelled) return;
        setState({ loading: false, error: String(e), rows: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasMock = useMemo(() => state.rows.some((r) => r.isMock), [state.rows]);

  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Leaderboard</h1>
        <p className="subtitle">
          Top scores across players. This list is offline-friendly: when the backend is unavailable, the app shows mock data instead
          of failing.
        </p>

        <div className="leaderboardHeaderRow" aria-label="Leaderboard controls">
          <button className="btn btn-secondary" onClick={onBack} aria-label="Back to previous screen">
            Back
          </button>

          <div className="leaderboardMeta" aria-live="polite">
            {state.loading ? (
              <span className="muted">Loading scores…</span>
            ) : state.error ? (
              <span className="muted">Could not load scores. Showing empty state.</span>
            ) : state.rows.length ? (
              <span className="muted">
                Showing <strong>{state.rows.length}</strong> entries{hasMock ? " (mock)" : ""}.
              </span>
            ) : (
              <span className="muted">No scores yet.</span>
            )}
          </div>
        </div>

        {state.loading ? (
          <div className="leaderboardEmpty" role="status" aria-label="Leaderboard loading">
            <span className="muted">Fetching leaderboard…</span>
          </div>
        ) : state.rows.length === 0 ? (
          <div className="leaderboardEmpty" role="status" aria-label="Leaderboard empty">
            <div style={{ fontWeight: 900, fontSize: 18 }}>No scores yet</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Play a solo game to create the first entry. Scores submit best-effort and never block gameplay.
            </div>
          </div>
        ) : (
          <div className="leaderboardTableWrap" role="region" aria-label="Leaderboard table region" tabIndex={0}>
            <table className="leaderboardTable" aria-label="Leaderboard table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 72 }}>
                    Rank
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col" style={{ width: 110, textAlign: "right" }}>
                    Score
                  </th>
                  <th scope="col" style={{ width: 150 }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, idx) => (
                  <tr key={`${row.name}-${row.score}-${row.createdAt || "na"}-${idx}`}>
                    <td className="leaderboardRank">{idx + 1}</td>
                    <td>
                      <span>{row.name}</span>
                      {row.isMock ? <span className="muted"> (mock)</span> : null}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 900 }}>{row.score}</td>
                    <td className="leaderboardDate">{formatScoreDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="finePrint">
          <p className="muted" style={{ margin: 0 }}>
            Tip: Use keyboard <kbd>Tab</kbd> to reach the table container; it’s scrollable on small screens.
          </p>
        </div>
      </div>
    </div>
  );
}
