import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/restClient";
import { formatScoreDate, formatScoreName, normalizeScoreRow } from "./leaderboardUtils";

// PUBLIC_INTERFACE
export default function LeaderboardPreview({ limit = 5, onViewFull }) {
  /** Compact leaderboard preview for the Home screen (non-fatal network usage). */
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
        const scores = await apiClient.getTopScores();
        if (cancelled) return;

        const rows = Array.isArray(scores) ? scores.map(normalizeScoreRow).slice(0, Math.max(1, limit)) : [];
        setState({ loading: false, error: null, rows });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, error: String(e), rows: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  const hasMock = useMemo(() => state.rows.some((r) => r.isMock), [state.rows]);

  return (
    <div className="leaderboardPreview" aria-label="Leaderboard preview">
      <div className="leaderboardPreviewHeader">
        <div>
          <div className="resultLabel">Leaderboard</div>
          <div className="leaderboardPreviewTitle">
            Top {Math.max(1, limit)}
            {hasMock ? <span className="muted"> (mock)</span> : null}
          </div>
        </div>

        <button className="btn btn-secondary" onClick={onViewFull} aria-label="View full leaderboard">
          View full
        </button>
      </div>

      {state.loading ? (
        <div className="muted" role="status" aria-label="Leaderboard preview loading">
          Loading…
        </div>
      ) : state.rows.length === 0 ? (
        <div className="muted" role="status" aria-label="Leaderboard preview empty">
          No scores yet. Play a solo game to be first.
        </div>
      ) : (
        <ol className="leaderboardPreviewList" aria-label="Top scores list">
          {state.rows.map((row, idx) => (
            <li key={`${formatScoreName(row.name)}-${row.score}-${idx}`} className="leaderboardPreviewRow">
              <span className="leaderboardPreviewRank" aria-label={`Rank ${idx + 1}`}>
                {idx + 1}
              </span>
              <span className="leaderboardPreviewName">{formatScoreName(row.name)}</span>
              <span className="leaderboardPreviewScore" aria-label={`Score ${row.score}`}>
                {row.score}
              </span>
              <span className="leaderboardPreviewDate">{formatScoreDate(row.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}

      {state.error ? (
        <div className="finePrint muted" role="status" aria-label="Leaderboard preview error">
          Could not reach backend; continuing offline.
        </div>
      ) : null}
    </div>
  );
}
