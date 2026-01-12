import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/restClient";
import { useProfile } from "../profile/useProfile";

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

 // PUBLIC_INTERFACE
export default function ResultsScreen({ results, onPlayAgain, onBackHome, onViewProfile }) {
  /** Results screen: shows score and duration, offers play again. */

  const score = results?.score ?? 0;

  const defaultName = useMemo(() => {
    // Keep it deterministic and UI-friendly. Real profile/auth will replace this later.
    const n = score > 0 ? "Player" : "Anonymous";
    return n;
  }, [score]);

  const profileApi = useProfile({ auto: true });

  const [submitState, setSubmitState] = useState(() => ({
    loading: false,
    done: false,
    isMock: false,
    message: ""
  }));

  // Best-effort submit score once per results screen mount.
  // Never blocks navigation; errors are surfaced as a small status line only.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Avoid spamming submissions for empty/zero scores.
      if (!Number.isFinite(score) || score <= 0) {
        setSubmitState({ loading: false, done: true, isMock: true, message: "Score not submitted (0)." });
        return;
      }

      setSubmitState({ loading: true, done: false, isMock: false, message: "Submitting score…" });

      const name = (profileApi.profile && typeof profileApi.profile.name === "string" && profileApi.profile.name) || defaultName;

      // Requirements payload: { score, duration, timestamp, mode: "solo" }
      const payload = {
        name,
        score,
        duration: Number.isFinite(results?.elapsedMs) ? Math.max(0, results.elapsedMs) : 0,
        timestamp: new Date().toISOString(),
        mode: "solo"
      };

      try {
        const res = await apiClient.submitScore(payload);

        if (cancelled) return;

        // If the client returned an ApiError (ok:false), treat as offline submit.
        if (res && res.ok === false) {
          setSubmitState({
            loading: false,
            done: true,
            isMock: Boolean(res.isMock),
            message: res.isMock ? "Offline: score not persisted (mock mode)." : `Submit failed: ${res.message || "Error"}`
          });
          return;
        }

        setSubmitState({ loading: false, done: true, isMock: false, message: "Score submitted." });
      } catch (e) {
        if (cancelled) return;
        setSubmitState({ loading: false, done: true, isMock: true, message: "Offline: score not persisted (mock mode)." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultName, profileApi.profile, results?.elapsedMs, score]);

  const profileLabel = profileApi.profile?.isMock ? "Offline Profile (mock)" : profileApi.profile ? "Profile" : "Profile (unavailable)";

  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Results</h1>
        <p className="subtitle">Nice run. Keep slicing.</p>

        <div className="resultsGrid" aria-label="Game results">
          <div className="resultItem">
            <div className="resultLabel">Score</div>
            <div className="resultValue">{score}</div>
          </div>
          <div className="resultItem">
            <div className="resultLabel">Time</div>
            <div className="resultValue">{formatMs(results?.elapsedMs ?? 0)}</div>
          </div>

          <div className="resultItem">
            <div className="resultLabel">{profileLabel}</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              {profileApi.profile?.name || "—"}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {profileApi.loading ? "Loading…" : profileApi.isSignedIn ? "Signed in (basic)" : "Not signed in"}
              {profileApi.source ? ` • ${profileApi.source}` : ""}
              {profileApi.profile?.isMock ? " (mock)" : ""}
            </div>
          </div>

          <div className="resultItem">
            <div className="resultLabel">Score Submit</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              {submitState.loading ? "Submitting…" : submitState.message || "—"}
              {submitState.isMock ? <span className="muted"> (mock)</span> : null}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary btn-large" onClick={onPlayAgain}>
            Play Again
          </button>
          <button className="btn btn-secondary" onClick={onBackHome}>
            Back Home
          </button>
          <button
            className="btn"
            onClick={() => {
              if (typeof onViewProfile === "function") onViewProfile();
            }}
          >
            Profile
          </button>
        </div>

        <div className="finePrint">
          <p className="muted">
            Online features are best-effort: GETs retry automatically; offline mode uses stubs (with <code>isMock</code> flags).
          </p>
        </div>
      </div>
    </div>
  );
}
