import React, { useEffect, useMemo, useRef, useState } from "react";
import { connect, disconnect, send, subscribe } from "../api/wsClient";
import { useWebSocketStatus } from "../api/useWebSocketStatus";
import { useProfile } from "../profile/useProfile";

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function mapConnStateToLabel(state) {
  if (state === "open") return "Connected";
  if (state === "connecting") return "Connecting";
  if (state === "mock") return "Connected (Mock)";
  if (state === "closing") return "Disconnecting";
  // idle/closed/error -> disconnected for user-facing simplicity
  return "Disconnected";
}

function mapConnStateToTone(state) {
  if (state === "open" || state === "mock") return "good";
  if (state === "connecting" || state === "closing") return "warn";
  if (state === "error") return "bad";
  return "neutral";
}

/**
 * Ephemeral notices (toast-like) shown inline.
 * We keep it dependency-free and accessible via aria-live.
 */
function pushNotice(setNotices, notice) {
  const n = notice && typeof notice === "object" ? notice : { message: String(notice) };
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  setNotices((prev) => [{ id, ...n }, ...prev].slice(0, 4));
  return id;
}

// PUBLIC_INTERFACE
export default function MultiplayerScreen({ onBackHome, onStartMatch }) {
  /**
   * Multiplayer Lobby screen:
   * - Shows WebSocket status using useWebSocketStatus()
   * - Allows Connect/Disconnect (mock-safe when REACT_APP_WS_URL unset; wsClient enters mock mode)
   * - Join/Leave Queue
   * - Local matchmaking simulation in mock mode
   * - Real WS mode subscribes to minimal events: queue:joined, queue:left, match:found
   * - Ensures cleanup on unmount: timers + ws subscriptions + (optional) queue leave
   */
  const ws = useWebSocketStatus();
  const profileApi = useProfile({ auto: true });

  const [displayName, setDisplayName] = useState("");
  const [lastError, setLastError] = useState(null);

  const [queueState, setQueueState] = useState("idle"); // idle | searching | matched
  const [joinedQueue, setJoinedQueue] = useState(false);
  const [opBusy, setOpBusy] = useState(false);

  const [notices, setNotices] = useState([]);

  const matchmakingTimerRef = useRef(null);
  const mountedRef = useRef(false);

  const isConnected = ws.state === "open" || ws.state === "mock";
  const isMockMode = Boolean(ws.isMock) || ws.state === "mock";

  const connLabel = useMemo(() => mapConnStateToLabel(ws.state), [ws.state]);
  const connTone = useMemo(() => mapConnStateToTone(ws.state), [ws.state]);

  // Initialize display name from profile when available.
  useEffect(() => {
    const n = safeTrim(profileApi.profile?.name);
    if (!n) return;

    // Only hydrate if user hasn't started typing.
    setDisplayName((prev) => (safeTrim(prev) ? prev : n));
  }, [profileApi.profile?.name]);

  // Subscribe to wsClient events (error + minimal app events).
  useEffect(() => {
    mountedRef.current = true;

    const offError = subscribe("error", (payload) => {
      const msg = safeTrim(payload?.message) || "WebSocket error";
      setLastError(msg);
      pushNotice(setNotices, { message: msg, tone: "bad" });
    });

    const offQueueJoined = subscribe("queue:joined", (payload) => {
      setJoinedQueue(true);
      setQueueState("searching");
      const name = safeTrim(payload?.name);
      pushNotice(setNotices, { message: name ? `Joined queue as ${name}.` : "Joined queue.", tone: "good" });
    });

    const offQueueLeft = subscribe("queue:left", () => {
      setJoinedQueue(false);
      setQueueState("idle");
      pushNotice(setNotices, { message: "Left queue.", tone: "neutral" });
    });

    const offMatchFound = subscribe("match:found", (payload) => {
      setQueueState("matched");
      setJoinedQueue(false);
      const opponent = safeTrim(payload?.opponent) || "Opponent";
      pushNotice(setNotices, { message: `Match found vs ${opponent}.`, tone: "good" });
    });

    return () => {
      mountedRef.current = false;

      // Cleanup timers
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }

      // Cleanup listeners
      offError();
      offQueueJoined();
      offQueueLeft();
      offMatchFound();

      // Reset UI state so remount is clean
      setNotices([]);
      setLastError(null);
      setOpBusy(false);
      setJoinedQueue(false);
      setQueueState("idle");
    };
  }, []);

  // When disconnected, ensure local matchmaking state is not stuck.
  useEffect(() => {
    if (!isConnected) {
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }
      setJoinedQueue(false);
      setQueueState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const canConnect = ws.state !== "open" && ws.state !== "mock" && ws.state !== "connecting";
  const canDisconnect = ws.state === "open" || ws.state === "mock" || ws.state === "connecting" || ws.state === "closing";

  const normalizedName = safeTrim(displayName) || "Guest";

  const handleConnect = async () => {
    setLastError(null);
    setOpBusy(true);
    try {
      // Path is optional; keep blank unless backend expects /ws.
      connect({ path: "" });

      pushNotice(setNotices, {
        message: "Connecting… (Mock mode will be used if REACT_APP_WS_URL is unset).",
        tone: "neutral"
      });
    } finally {
      // We keep UI responsive and do not wait for open; status hook will update.
      setTimeout(() => {
        if (!mountedRef.current) return;
        setOpBusy(false);
      }, 150);
    }
  };

  const handleDisconnect = async () => {
    setOpBusy(true);
    try {
      // Best-effort leave queue before disconnect (for real backend), but don't block UI if it fails.
      if (joinedQueue && !isMockMode) {
        send({ event: "queue:left", data: { name: normalizedName } });
      }

      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }

      setJoinedQueue(false);
      setQueueState("idle");
      disconnect();
      pushNotice(setNotices, { message: "Disconnected.", tone: "neutral" });
    } finally {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setOpBusy(false);
      }, 150);
    }
  };

  const startMockMatchmaking = () => {
    // Simulate a short matchmaking delay then match vs bot.
    if (matchmakingTimerRef.current) clearTimeout(matchmakingTimerRef.current);

    matchmakingTimerRef.current = setTimeout(() => {
      matchmakingTimerRef.current = null;
      if (!mountedRef.current) return;

      setQueueState("matched");
      setJoinedQueue(false);
      pushNotice(setNotices, { message: "Matched vs. Bot (local simulation).", tone: "good" });
    }, 1400);
  };

  const handleJoinQueue = async () => {
    if (!isConnected) {
      pushNotice(setNotices, { message: "Connect first to join the queue.", tone: "warn" });
      return;
    }

    setOpBusy(true);
    setLastError(null);

    try {
      setJoinedQueue(true);
      setQueueState("searching");

      if (isMockMode) {
        pushNotice(setNotices, { message: `Joined queue as ${normalizedName}.`, tone: "good" });
        startMockMatchmaking();
        return;
      }

      // Real backend: send minimal join message; server is expected to emit queue:joined etc.
      send({ event: "queue:join", data: { name: normalizedName } });
      pushNotice(setNotices, { message: "Join request sent.", tone: "neutral" });
    } finally {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setOpBusy(false);
      }, 150);
    }
  };

  const handleLeaveQueue = async () => {
    setOpBusy(true);
    try {
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }
      setJoinedQueue(false);
      setQueueState("idle");

      if (!isMockMode) {
        send({ event: "queue:left", data: { name: normalizedName } });
      }

      pushNotice(setNotices, { message: "Left queue.", tone: "neutral" });
    } finally {
      setTimeout(() => {
        if (!mountedRef.current) return;
        setOpBusy(false);
      }, 150);
    }
  };

  const handleStartMatch = () => {
    // UI-only: route back to Game with multiplayer mode enabled.
    if (typeof onStartMatch === "function") {
      onStartMatch({ mode: "multiplayer" });
      return;
    }

    // Fallback: still do something safe if parent hasn't wired handler yet.
    pushNotice(setNotices, { message: "Start match action is not available in this build.", tone: "warn" });
  };

  const statusBadgeStyle = useMemo(() => {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600
    };

    if (connTone === "good") return { ...base, background: "rgba(46, 204, 113, 0.15)", color: "#b7f7c9" };
    if (connTone === "warn") return { ...base, background: "rgba(241, 196, 15, 0.15)", color: "#ffeaa7" };
    if (connTone === "bad") return { ...base, background: "rgba(231, 76, 60, 0.15)", color: "#ffb3ab" };
    return { ...base, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" };
  }, [connTone]);

  const queueText =
    queueState === "matched" ? "Matched" : queueState === "searching" ? "Searching…" : joinedQueue ? "In queue" : "Not in queue";

  const joinDisabled = opBusy || !isConnected || queueState === "searching" || queueState === "matched";
  const leaveDisabled = opBusy || (!joinedQueue && queueState !== "searching");

  const connectDisabled = opBusy || !canConnect;
  const disconnectDisabled = opBusy || !canDisconnect;

  return (
    <div className="screen">
      <div className="card">
        <h1 className="title">Multiplayer Lobby</h1>
        <p className="subtitle">
          Queue up for a match. If the WebSocket backend isn’t configured, the lobby runs in local mock mode (no real sync), and you can
          still start a simulated match.
        </p>

        {/* Notices (toast-like) */}
        <div aria-live="polite" aria-atomic="true" style={{ marginBottom: 12 }}>
          {notices.length > 0 ? (
            <div className="resultsGrid" aria-label="Lobby notices" style={{ gridTemplateColumns: "1fr" }}>
              {notices.map((n) => (
                <div
                  key={n.id}
                  className="resultItem"
                  style={{
                    borderLeft: `4px solid ${
                      n.tone === "good" ? "rgba(46, 204, 113, 0.9)" : n.tone === "bad" ? "rgba(231, 76, 60, 0.9)" : "rgba(255,255,255,0.25)"
                    }`
                  }}
                >
                  <div className="resultLabel">Notice</div>
                  <div className="resultValue" style={{ fontSize: 14 }}>
                    {n.message}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="resultsGrid" aria-label="Connection and queue status">
          <div className="resultItem">
            <div className="resultLabel">Connection</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              <span style={statusBadgeStyle}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: "currentColor", opacity: 0.8 }} />
                {connLabel}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              {ws.url ? (
                <>
                  URL: <code>{ws.url}</code>
                </>
              ) : (
                <>
                  URL: <code>(unset)</code> — set <code>REACT_APP_WS_URL</code> to enable real multiplayer.
                </>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Outbound queued: <strong>{ws.queued ?? 0}</strong>
            </div>
            {lastError ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }} role="status">
                Last error: <span style={{ color: "rgba(255, 180, 170, 0.95)" }}>{lastError}</span>
              </div>
            ) : null}
          </div>

          <div className="resultItem">
            <div className="resultLabel">Player</div>
            <div className="resultValue" style={{ fontSize: 16 }}>
              <label htmlFor="displayName" className="muted" style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
                Display name
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="textInput"
                inputMode="text"
                autoComplete="nickname"
                aria-describedby="displayNameHint"
                placeholder={profileApi.loading ? "Loading…" : "Enter name"}
                disabled={opBusy}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "inherit"
                }}
              />
              <div id="displayNameHint" className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Used for queue + match notices. Profile name will prefill when available.
              </div>
            </div>
          </div>

          <div className="resultItem" style={{ gridColumn: "1 / -1" }}>
            <div className="resultLabel">Queue</div>
            <div className="resultValue" style={{ fontSize: 18 }}>
              {queueText}
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              {isMockMode ? "Mock matchmaking: will match you vs. Bot after a short delay." : "Backend matchmaking: waits for server events."}
            </div>

            <div className="actions" style={{ justifyContent: "flex-start", marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={handleJoinQueue} disabled={joinDisabled}>
                Join Queue
              </button>

              <button className="btn" onClick={handleLeaveQueue} disabled={leaveDisabled}>
                Leave Queue
              </button>

              <button className="btn btn-primary" onClick={handleStartMatch} disabled={queueState !== "matched" || opBusy}>
                Start Match
              </button>
            </div>
          </div>
        </div>

        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={handleConnect} disabled={connectDisabled}>
            Connect
          </button>
          <button className="btn" onClick={handleDisconnect} disabled={disconnectDisabled}>
            Disconnect
          </button>
          <button className="btn btn-primary" onClick={onBackHome} disabled={opBusy}>
            Back Home
          </button>
        </div>

        <div className="finePrint">
          <p className="muted">
            Events listened: <code>queue:joined</code>, <code>queue:left</code>, <code>match:found</code>. In real mode we send{" "}
            <code>queue:join</code> / <code>queue:left</code> requests.
          </p>
        </div>
      </div>
    </div>
  );
}
