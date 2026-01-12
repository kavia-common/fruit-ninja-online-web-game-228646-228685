import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/restClient";
import LeaderboardPreview from "./LeaderboardPreview";
import { useProfile } from "../profile/useProfile";

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

// PUBLIC_INTERFACE
export default function HomeScreen({ onStartSolo, onStartMultiplayer, onViewLeaderboard, onViewProfile }) {
  /** Home screen: entry point to start solo, or go to multiplayer placeholder UI, show profile + leaderboard preview. */

  const [backend, setBackend] = useState(() => ({ loading: true, mode: "offline", isMock: true }));
  const profileApi = useProfile({ auto: true });

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

  const profileName = safeTrim(profileApi.profile?.name) || "Guest";
  const avatarText = safeTrim(profileApi.profile?.avatar);
  const profileStatus = profileApi.loading
    ? "Loading…"
    : profileApi.isSignedIn
      ? profileApi.source === "remote"
        ? "Signed in (synced)"
        : "Signed in (local)"
      : "Not signed in";

  const profileHint = profileApi.isSignedIn
    ? "Used for score submissions when available."
    : "Optional: set name/avatar to personalize scores.";

  const hasProfileError = Boolean(profileApi.error);

  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Fruit Ninja Online</h1>
        <p className="subtitle">Choose a mode. Solo is playable now; Multiplayer is a placeholder UI for upcoming backend.</p>

        <div className="resultsGrid" aria-label="Connectivity, profile and leaderboard preview">
          <div className="resultItem">
            <div className="resultLabel">Backend</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              {statusText}
            </div>
          </div>

          <div className="resultItem">
            <div className="resultLabel">Profile</div>
            <div className="profileMiniRow" aria-label="Current player profile summary">
              <div className="profileMiniAvatar" aria-hidden="true">
                {avatarText ? avatarText.slice(0, 2) : "—"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="profileMiniName" title={profileName}>
                  {profileName}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {profileStatus} • {profileHint}
                </div>
              </div>
            </div>

            {hasProfileError ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }} role="status">
                Offline: using local profile.
              </div>
            ) : null}

            <div className="actions" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (typeof onViewProfile === "function") onViewProfile();
                }}
              >
                {profileApi.isSignedIn ? "Edit profile" : "Set up profile"}
              </button>
            </div>
          </div>

          <div className="resultItem" style={{ gridColumn: "1 / -1" }}>
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
