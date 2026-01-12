/**
 * WebSocket client abstraction for Fruit Ninja Online.
 *
 * Features:
 * - Env-driven URL via REACT_APP_WS_URL (fallbacks allowed)
 * - Event subscriptions: open, close, error, message + custom app events
 * - Exponential backoff reconnect with jitter
 * - Heartbeat/ping to detect stale connections
 * - Outbound queue until connected
 * - Graceful mock/no-op mode when no WS URL configured
 *
 * Notes:
 * - This module intentionally avoids hard-coding backend addresses.
 * - In CRA, REACT_APP_* env vars are inlined at build time.
 */

/**
 * @typedef {"idle"|"mock"|"connecting"|"open"|"closing"|"closed"|"error"} ConnectionState
 */

/**
 * @typedef {{
 *   path?: string,
 *   protocols?: string | string[],
 *   /** Overrides default reconnection behavior (default: true) *\/
 *   autoReconnect?: boolean,
 * }} ConnectOptions
 */

const DEFAULTS = Object.freeze({
  // Heartbeat: client sends ping periodically, expects any inbound message within staleThresholdMs.
  heartbeatIntervalMs: 15000,
  staleThresholdMs: 45000,

  // Reconnect backoff
  reconnectInitialMs: 500,
  reconnectMaxMs: 20000,
  reconnectJitterRatio: 0.25,

  // Outbound queue
  maxQueueSize: 200
});

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function nowMs() {
  return Date.now();
}

function toArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function hasWebSocketSupport() {
  return typeof window !== "undefined" && typeof window.WebSocket === "function";
}

/**
 * Derive ws URL from env.
 * Allowed inputs:
 * - ws://host:port
 * - wss://host:port
 * - http(s)://host:port (we will convert to ws(s))
 */
function resolveWsBaseUrlFromEnv() {
  const raw = safeTrim(process.env.REACT_APP_WS_URL);

  if (raw) {
    // Accept ws(s) and http(s)
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) return raw.replace(/\/+$/, "");
    if (raw.startsWith("http://")) return `ws://${raw.slice("http://".length)}`.replace(/\/+$/, "");
    if (raw.startsWith("https://")) return `wss://${raw.slice("https://".length)}`.replace(/\/+$/, "");

    // Bare host:port (fallback)
    if (/^[\w.-]+(?::\d+)?$/i.test(raw)) {
      // default to ws in dev
      return `ws://${raw}`.replace(/\/+$/, "");
    }
    return raw.replace(/\/+$/, "");
  }

  // Fallbacks allowed: try to infer from current window location (useful for local dev).
  // Note: This *only* runs if REACT_APP_WS_URL is not set; but we still keep "mock mode" unless explicitly inferred.
  // We choose to infer only when window.location exists and is http(s).
  if (typeof window !== "undefined" && window.location && window.location.protocol) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    if (host) return `${proto}//${host}`.replace(/\/+$/, "");
  }

  return "";
}

function joinUrl(base, path) {
  const b = safeTrim(base).replace(/\/+$/, "");
  const p = safeTrim(path);
  if (!b) return "";
  if (!p) return b;
  return `${b}${p.startsWith("/") ? "" : "/"}${p}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jitterDelay(ms, jitterRatio) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(jitterRatio) ? jitterRatio : 0));
  const delta = ms * ratio;
  const min = ms - delta;
  const max = ms + delta;
  return Math.max(0, Math.round(min + Math.random() * (max - min)));
}

function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();

  function getSet(name) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return handlers.get(name);
  }

  return {
    // PUBLIC_INTERFACE
    on(eventName, handler) {
      /** Subscribe to an event. Returns unsubscribe function. */
      if (typeof eventName !== "string" || typeof handler !== "function") return () => {};
      const s = getSet(eventName);
      s.add(handler);
      return () => {
        s.delete(handler);
      };
    },

    // PUBLIC_INTERFACE
    off(eventName, handler) {
      /** Unsubscribe from an event. */
      const s = handlers.get(eventName);
      if (!s) return;
      s.delete(handler);
    },

    emit(eventName, payload) {
      const s = handlers.get(eventName);
      if (!s || s.size === 0) return;

      // Copy first, so handlers can unsubscribe safely during emit.
      [...s].forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          // Avoid crashing app due to handler errors.
          // eslint-disable-next-line no-console
          console.warn(`[wsClient] handler error for event "${eventName}"`, e);
        }
      });
    },

    clearAll() {
      handlers.clear();
    }
  };
}

function createMockSocket(emitter) {
  // Mock mode simulates connection without network.
  // It emits open quickly and echoes sends as 'message' events.
  let open = false;
  let closed = false;

  const id = setTimeout(() => {
    if (closed) return;
    open = true;
    emitter.emit("open", { isMock: true });
  }, 10);

  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(id);
      if (open) emitter.emit("close", { code: 1000, reason: "mock closed", wasClean: true, isMock: true });
      open = false;
    },
    send(data) {
      if (!open || closed) return;
      // Echo back
      const payload = typeof data === "string" ? data : String(data);
      setTimeout(() => {
        if (!open || closed) return;
        emitter.emit("message", { data: payload, isMock: true });
      }, 0);
    },
    get readyState() {
      // 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
      if (closed) return 3;
      if (open) return 1;
      return 0;
    }
  };
}

/**
 * Internal singleton state.
 * This module exports functions (not a class) to keep usage simple.
 */
const emitter = createEmitter();

/** @type {WebSocket|null} */
let ws = null;

/** @type {ReturnType<typeof createMockSocket> | null} */
let mockWs = null;

/** @type {ConnectionState} */
let state = "idle";

let connectOptions = /** @type {ConnectOptions} */ ({});
let lastUrl = "";
let shouldReconnect = true;
let reconnectAttempt = 0;
let reconnectTimer = /** @type {any} */ (null);
let heartbeatTimer = /** @type {any} */ (null);
let lastInboundAt = 0;
let lastOpenAt = 0;
let explicitlyDisconnected = false;

/** @type {Array<string>} */
let outboundQueue = [];

/**
 * PUBLIC_INTERFACE
 * Subscribe to events.
 *
 * Supported built-in events:
 * - "open" (payload: { url, protocols, isMock })
 * - "close" (payload: { code, reason, wasClean, isMock })
 * - "error" (payload: { message, error, isMock })
 * - "message" (payload: { data, raw, isMock })
 * - "status" (payload: { state, url, isMock })
 *
 * Custom app events:
 * - if inbound message is JSON like { event: "roomJoined", data: {...} }, it will emit "roomJoined" with payload.data.
 */
// PUBLIC_INTERFACE
export function subscribe(eventName, handler) {
  /** Subscribe to ws client events. Returns unsubscribe function. */
  return emitter.on(eventName, handler);
}

// PUBLIC_INTERFACE
export function unsubscribe(eventName, handler) {
  /** Unsubscribe from ws client events. */
  emitter.off(eventName, handler);
}

// PUBLIC_INTERFACE
export function once(eventName) {
  /** Await a single event once. */
  return new Promise((resolve) => {
    const off = emitter.on(eventName, (payload) => {
      off();
      resolve(payload);
    });
  });
}

function emitStatus(isMock = false) {
  emitter.emit("status", { state, url: lastUrl || null, isMock });
}

/**
 * Queue or send immediately (string frames only).
 */
function sendFrame(frame) {
  if (typeof frame !== "string") return;

  const isOpen =
    (ws && ws.readyState === WebSocket.OPEN) || (mockWs && typeof mockWs.readyState === "number" && mockWs.readyState === 1);

  if (!isOpen) {
    // Queue until connected.
    if (outboundQueue.length >= DEFAULTS.maxQueueSize) {
      outboundQueue = outboundQueue.slice(-Math.floor(DEFAULTS.maxQueueSize * 0.8));
    }
    outboundQueue.push(frame);
    return;
  }

  try {
    if (ws) ws.send(frame);
    else if (mockWs) mockWs.send(frame);
  } catch (e) {
    outboundQueue.push(frame);
    emitter.emit("error", { message: "Failed to send WebSocket frame", error: e, isMock: Boolean(mockWs) });
  }
}

function flushQueue() {
  if (!outboundQueue.length) return;
  const frames = outboundQueue;
  outboundQueue = [];
  frames.forEach((f) => sendFrame(f));
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  clearHeartbeatTimer();

  lastInboundAt = nowMs();

  heartbeatTimer = setInterval(() => {
    // Detect staleness: if no inbound frames for too long while open => reconnect.
    const t = nowMs();
    const isOpen = ws && ws.readyState === WebSocket.OPEN;

    if (isOpen) {
      const staleFor = t - lastInboundAt;

      // Send ping (server may ignore; still useful to detect network issues)
      sendFrame(JSON.stringify({ type: "ping", t }));

      if (staleFor > DEFAULTS.staleThresholdMs) {
        emitter.emit("error", {
          message: `Stale WebSocket connection detected (no inbound data for ${staleFor}ms)`,
          error: null,
          isMock: false
        });
        // Force reconnect by closing; onclose handler will schedule reconnect.
        try {
          ws.close(4000, "stale");
        } catch {
          // ignore
        }
      }
    }
  }, DEFAULTS.heartbeatIntervalMs);
}

function scheduleReconnect(reason) {
  if (!shouldReconnect || explicitlyDisconnected) return;

  clearReconnectTimer();

  const attempt = reconnectAttempt;
  const base = Math.min(DEFAULTS.reconnectMaxMs, DEFAULTS.reconnectInitialMs * Math.pow(2, attempt));
  const delay = jitterDelay(base, DEFAULTS.reconnectJitterRatio);

  reconnectTimer = setTimeout(() => {
    reconnectAttempt += 1;
    // eslint-disable-next-line no-console
    console.log("[wsClient] reconnecting", { attempt: reconnectAttempt, delay, reason });
    internalConnect({ ...connectOptions });
  }, delay);
}

function cleanupSocketRefs() {
  if (ws) {
    try {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
    } catch {
      // ignore
    }
  }
  ws = null;

  if (mockWs) {
    try {
      mockWs.close();
    } catch {
      // ignore
    }
  }
  mockWs = null;
}

function internalConnect(options) {
  connectOptions = options || {};
  explicitlyDisconnected = false;

  const baseUrl = resolveWsBaseUrlFromEnv();
  const url = joinUrl(baseUrl, connectOptions.path || "");
  lastUrl = url;

  // If env var was not set and we couldn't infer a reasonable URL, fall back to mock mode.
  // This keeps multiplayer UI functional while backend isn't configured.
  const hasConfiguredUrl = Boolean(safeTrim(process.env.REACT_APP_WS_URL));
  const canUseReal = hasWebSocketSupport() && Boolean(url);

  if (!canUseReal || !hasConfiguredUrl) {
    state = "mock";
    shouldReconnect = false; // don't "reconnect" a mock; it's always available
    reconnectAttempt = 0;
    clearReconnectTimer();
    clearHeartbeatTimer();
    cleanupSocketRefs();

    // Start mock socket and emit open.
    mockWs = createMockSocket(emitter);
    emitStatus(true);
    return;
  }

  if (!hasWebSocketSupport()) {
    // No-op mode (e.g., SSR / very old browser)
    state = "idle";
    shouldReconnect = false;
    emitStatus(false);
    return;
  }

  shouldReconnect = options && typeof options.autoReconnect === "boolean" ? options.autoReconnect : true;
  state = "connecting";
  emitStatus(false);

  cleanupSocketRefs();
  clearHeartbeatTimer();

  try {
    ws = new WebSocket(url, options.protocols);
  } catch (e) {
    state = "error";
    emitStatus(false);
    emitter.emit("error", { message: "Failed to construct WebSocket", error: e, isMock: false });
    scheduleReconnect("constructor_failed");
    return;
  }

  ws.onopen = () => {
    state = "open";
    reconnectAttempt = 0;
    lastOpenAt = nowMs();
    lastInboundAt = nowMs();
    emitStatus(false);

    emitter.emit("open", { url, protocols: options.protocols || null, isMock: false });

    startHeartbeat();
    flushQueue();
  };

  ws.onclose = (ev) => {
    clearHeartbeatTimer();

    // If we explicitly called disconnect(), do not reconnect.
    const isExplicit = explicitlyDisconnected;

    state = "closed";
    emitStatus(false);

    emitter.emit("close", {
      code: ev?.code ?? 1006,
      reason: ev?.reason ?? "",
      wasClean: Boolean(ev?.wasClean),
      isMock: false
    });

    if (!isExplicit && shouldReconnect) {
      scheduleReconnect("close");
    }
  };

  ws.onerror = (ev) => {
    // Browsers provide limited details here.
    state = "error";
    emitStatus(false);
    emitter.emit("error", { message: "WebSocket error", error: ev || null, isMock: false });
    // Let close event drive reconnect; but in some cases error occurs without close quickly.
    scheduleReconnect("error");
  };

  ws.onmessage = (ev) => {
    lastInboundAt = nowMs();
    const raw = ev?.data;

    // Normalize to string when possible (Blob/ArrayBuffer possible, but we keep it simple for now).
    let data = raw;
    if (raw && typeof raw !== "string") {
      try {
        // Best effort.
        data = String(raw);
      } catch {
        data = raw;
      }
    }

    emitter.emit("message", { data, raw, isMock: false });

    // Optional convention: { event, data } messages emit both "event" and "message".
    if (typeof data === "string") {
      const parsed = safeJsonParse(data);
      if (parsed && typeof parsed === "object") {
        const evtName = safeTrim(parsed.event);
        if (evtName) {
          emitter.emit(evtName, parsed.data);
        }
      }
    }
  };
}

/**
 * PUBLIC_INTERFACE
 * Connect to websocket.
 *
 * If REACT_APP_WS_URL is missing, this switches to mock mode (no network),
 * and emits "open" quickly with `{ isMock: true }`.
 */
// PUBLIC_INTERFACE
export function connect(options = {}) {
  /** Connect (or reconnect) the singleton WebSocket client. */
  clearReconnectTimer();
  connectOptions = options || {};
  explicitlyDisconnected = false;
  internalConnect(connectOptions);
}

/**
 * PUBLIC_INTERFACE
 * Disconnect and stop reconnect attempts.
 */
// PUBLIC_INTERFACE
export function disconnect() {
  /** Disconnect and stop reconnection attempts. */
  explicitlyDisconnected = true;
  shouldReconnect = false;
  clearReconnectTimer();
  clearHeartbeatTimer();

  state = "closing";
  emitStatus(Boolean(mockWs));

  if (ws) {
    try {
      ws.close(1000, "client_disconnect");
    } catch {
      // ignore
    }
  }
  if (mockWs) {
    try {
      mockWs.close();
    } catch {
      // ignore
    }
  }

  cleanupSocketRefs();
  state = "closed";
  emitStatus(Boolean(mockWs));
}

/**
 * PUBLIC_INTERFACE
 * Send either a string or an object.
 *
 * - string is sent as-is
 * - object is sent as JSON.stringify(object)
 *
 * If not connected, message is queued until open.
 */
// PUBLIC_INTERFACE
export function send(message) {
  /** Send a message (string or object). Queues when disconnected. */
  if (message === null || typeof message === "undefined") return;

  if (typeof message === "string") {
    sendFrame(message);
    return;
  }

  if (typeof message === "object") {
    try {
      sendFrame(JSON.stringify(message));
    } catch (e) {
      emitter.emit("error", { message: "Failed to serialize message as JSON", error: e, isMock: Boolean(mockWs) });
    }
  }
}

/**
 * PUBLIC_INTERFACE
 * Get current connection state snapshot.
 */
// PUBLIC_INTERFACE
export function getStatus() {
  /** Return a snapshot of connection status for UI. */
  const isMock = state === "mock" || Boolean(mockWs);
  return {
    state,
    url: lastUrl || null,
    isMock,
    reconnectAttempt,
    lastOpenAt: lastOpenAt || null,
    lastInboundAt: lastInboundAt || null,
    queued: outboundQueue.length
  };
}

/**
 * PUBLIC_INTERFACE
 * Test helper: inject a WebSocket implementation.
 * This is used only for unit tests.
 */
// PUBLIC_INTERFACE
export function __setWebSocketImplForTests(WebSocketImpl) {
  /** Inject a custom WebSocket implementation (tests only). */
  if (typeof window !== "undefined") {
    window.WebSocket = WebSocketImpl;
  }
}

/**
 * Inline usage example:
 *
 * import { connect, disconnect, send, subscribe } from "./api/wsClient";
 *
 * connect({ path: "/ws" });
 * const off = subscribe("open", () => send({ event: "hello", data: { name: "Player" } }));
 * const offMsg = subscribe("message", ({ data }) => console.log("ws message", data));
 *
 * // cleanup
 * off(); offMsg(); disconnect();
 */
