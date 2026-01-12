/**
 * REST API client for the Fruit Ninja Online frontend.
 *
 * Requirements for step 01.04:
 * - Expose: health(), getTopScores(), submitScore(payload), getProfile(), updateProfile(payload)
 * - Use REACT_APP_API_BASE (preferred) or REACT_APP_BACKEND_URL (fallback) for base URL
 * - Include timeouts, retries (idempotent GETs only), and clear error objects
 * - Mock-friendly behavior when env vars are missing or network fails:
 *   - return sensible stub data and set an `isMock` flag on returned objects where feasible
 *   - do not break UI if backend is offline
 */

/**
 * @typedef {Object} ApiError
 * @property {false} ok Always false for errors; provided for ergonomic branching
 * @property {string} name Machine-readable error name
 * @property {string} message Human-readable message
 * @property {number|null} status HTTP status if available
 * @property {string|null} url Request URL if available
 * @property {string|null} method HTTP method
 * @property {boolean} isNetwork True if request failed due to network/connection issues
 * @property {boolean} isTimeout True if request timed out
 * @property {boolean} isMock True if this error is generated in offline/mock mode
 * @property {any|null} details Optional extra details (e.g., response body, parse error)
 */

/**
 * @typedef {Object} HealthResult
 * @property {boolean} ok
 * @property {"remote"|"offline"} mode
 * @property {string|null} baseUrl
 * @property {number} latencyMs
 * @property {string|null} message
 * @property {ApiError|null} error
 * @property {boolean} isMock
 */

/**
 * @typedef {Object} ScoreRow
 * @property {string} name
 * @property {number} score
 * @property {string} [createdAt]
 * @property {boolean} [isMock]
 */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string|null} avatar
 * @property {any} [preferences]
 * @property {boolean} [isMock]
 */

const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_GET_RETRIES = 2;

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function joinUrl(baseUrl, path) {
  const base = safeTrim(baseUrl).replace(/\/+$/, "");
  const p = safeTrim(path);
  if (!base) return "";
  if (!p) return base;
  return `${base}${p.startsWith("/") ? "" : "/"}${p}`;
}

function getApiBaseUrlFromEnv() {
  // CRA exposes env vars at build time through process.env.REACT_APP_*
  const preferred = safeTrim(process.env.REACT_APP_API_BASE);
  const fallback = safeTrim(process.env.REACT_APP_BACKEND_URL);
  const raw = preferred || fallback;
  return raw.replace(/\/+$/, "");
}

function resolveHealthPath() {
  // Optional override for backend health-check path.
  // If not provided, use "/health".
  const p = safeTrim(process.env.REACT_APP_HEALTHCHECK_PATH);
  if (!p) return "/health";
  return p.startsWith("/") ? p : `/${p}`;
}

function isProbablyJsonResponse(contentType) {
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
}

function makeApiError(partial) {
  /** @type {ApiError} */
  const err = {
    ok: false,
    name: partial?.name || "ApiError",
    message: partial?.message || "Request failed",
    status: typeof partial?.status === "number" ? partial.status : null,
    url: typeof partial?.url === "string" ? partial.url : null,
    method: typeof partial?.method === "string" ? partial.method : null,
    isNetwork: Boolean(partial?.isNetwork),
    isTimeout: Boolean(partial?.isTimeout),
    isMock: Boolean(partial?.isMock),
    details: partial?.details ?? null
  };
  return err;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function parseResponseBody(res) {
  const contentType = res.headers?.get?.("content-type") || "";
  if (isProbablyJsonResponse(contentType)) {
    try {
      return await res.json();
    } catch (e) {
      return { __parseError: true, message: "Failed to parse JSON response", error: String(e) };
    }
  }

  // Non-JSON: attempt text (still useful for debugging).
  try {
    return await res.text();
  } catch (e) {
    return { __parseError: true, message: "Failed to read response body", error: String(e) };
  }
}

/**
 * Low-level request helper.
 * Returns `{ ok: true, data, status }` or an ApiError (`{ ok: false, ... }`).
 * Retries only for GET requests (idempotent) by default.
 */
async function requestJson(fetchImpl, path, options = {}) {
  const baseUrl = getApiBaseUrlFromEnv();
  const url = joinUrl(baseUrl, path);

  const method = (options.method || "GET").toUpperCase();
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  // When there is no base URL, we cannot issue any network request.
  if (!baseUrl) {
    return makeApiError({
      name: "BackendNotConfigured",
      message: "Backend URL not configured. Set REACT_APP_API_BASE or REACT_APP_BACKEND_URL to enable online features.",
      status: null,
      url: null,
      method,
      isNetwork: true,
      isTimeout: false,
      isMock: true,
      details: { missingEnv: ["REACT_APP_API_BASE", "REACT_APP_BACKEND_URL"] }
    });
  }

  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const body =
    hasBody && typeof options.body !== "string" ? JSON.stringify(options.body) : hasBody ? options.body : undefined;

  if (hasBody && typeof headers["Content-Type"] === "undefined" && typeof headers["content-type"] === "undefined") {
    headers["Content-Type"] = "application/json";
  }

  const maxRetries =
    typeof options.retries === "number"
      ? options.retries
      : method === "GET"
        ? DEFAULT_GET_RETRIES
        : 0;

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method,
          headers,
          body,
          credentials: "omit" // Keep template simple; adjust later when auth is added.
        },
        timeoutMs
      );

      const parsed = await parseResponseBody(res);

      if (!res.ok) {
        return makeApiError({
          name: "HttpError",
          message: `HTTP ${res.status} ${res.statusText || ""}`.trim(),
          status: res.status,
          url,
          method,
          isNetwork: false,
          isTimeout: false,
          isMock: false,
          details: parsed
        });
      }

      return {
        ok: true,
        status: res.status,
        data: parsed
      };
    } catch (e) {
      const isAbort = e && typeof e === "object" && String(e.name) === "AbortError";

      const err = makeApiError({
        name: isAbort ? "TimeoutError" : "NetworkError",
        message: isAbort ? `Request timed out after ${timeoutMs}ms` : "Network error while contacting backend",
        status: null,
        url,
        method,
        isNetwork: true,
        isTimeout: isAbort,
        isMock: false,
        details: { error: String(e) }
      });

      // Retry only on GET, and only if attempts remain.
      if (method === "GET" && attempt < maxRetries) {
        const backoffMs = 250 * Math.pow(2, attempt); // 250, 500, 1000...
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }

      return err;
    }
  }

  // Should not happen, but keep a safe fallback.
  return makeApiError({ name: "UnknownError", message: "Unknown request failure", url, method, isMock: false });
}

// ---------- Mock/offline data helpers ----------

function makeMockScores() {
  /** @type {ScoreRow[]} */
  return [
    { name: "You (Offline)", score: 12, createdAt: new Date().toISOString(), isMock: true },
    { name: "Swift Slicer", score: 20, createdAt: new Date(Date.now() - 86400000).toISOString(), isMock: true },
    { name: "Fruit Fan", score: 16, createdAt: new Date(Date.now() - 3600000).toISOString(), isMock: true }
  ].sort((a, b) => b.score - a.score);
}

function makeMockProfile() {
  /** @type {Profile} */
  return {
    id: "offline",
    name: "Offline Player",
    avatar: null,
    preferences: { theme: "dark" },
    isMock: true
  };
}

function normalizeScoresPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.scores)) return data.scores;
  if (data && Array.isArray(data.topScores)) return data.topScores;
  return data;
}

// ---------- High-level API surface ----------

/**
 * PUBLIC_INTERFACE
 * Create a client instance. You can inject a custom fetch implementation for tests/mocks.
 */
export function createRestApiClient({ fetchImpl } = {}) {
  /** Create a REST API client (optionally inject fetch for tests). */
  const effectiveFetch = typeof fetchImpl === "function" ? fetchImpl : fetch;

  return buildHighLevelApi((path, options) => requestJson(effectiveFetch, path, options));
}

function buildHighLevelApi(_requestJson) {
  return {
    // PUBLIC_INTERFACE
    async health() {
      /** Check whether backend is reachable. Returns a structured result with mode + latency. */
      const baseUrl = getApiBaseUrlFromEnv();
      const t0 = performance.now();

      // Not configured: treat as offline mock mode (UI should still function).
      if (!baseUrl) {
        return /** @type {HealthResult} */ ({
          ok: true,
          mode: "offline",
          baseUrl: null,
          latencyMs: 0,
          message: "Offline mode: backend URL not configured.",
          error: null,
          isMock: true
        });
      }

      const res = await _requestJson(resolveHealthPath(), { method: "GET", retries: 1, timeoutMs: 3500 });
      const latencyMs = Math.max(0, Math.round(performance.now() - t0));

      if (res && res.ok) {
        return /** @type {HealthResult} */ ({
          ok: true,
          mode: "remote",
          baseUrl,
          latencyMs,
          message: "Backend reachable",
          error: null,
          isMock: false
        });
      }

      // Backend configured but down/unreachable — return ok:false but structured.
      return /** @type {HealthResult} */ ({
        ok: false,
        mode: "offline",
        baseUrl,
        latencyMs,
        message: "Backend unreachable; continuing in offline mode.",
        error: res,
        isMock: false
      });
    },

    // PUBLIC_INTERFACE
    async getTopScores() {
      /** Get leaderboard scores (mock fallback on failure). */
      const res = await _requestJson("/scores/top", { method: "GET" });

      if (res && res.ok) {
        const normalized = normalizeScoresPayload(res.data);
        return normalized;
      }

      // Graceful degradation: return mocked leaderboard, but keep a consistent shape.
      return makeMockScores();
    },

    // PUBLIC_INTERFACE
    async submitScore(payload) {
      /**
       * Submit a score.
       * Offline/mock behavior:
       * - if backend is not configured or fails, return an error object with `isMock: true` and include echoed payload
       *   so UI can still show "what would have been submitted".
       */
      const safePayload = {
        name: safeTrim(payload?.name) || "Anonymous",
        score: Number.isFinite(payload?.score) ? payload.score : 0
      };

      const res = await _requestJson("/scores", { method: "POST", body: safePayload, retries: 0 });

      if (res && res.ok) return res.data;

      // Non-idempotent; do not pretend it succeeded. Return a consistent error object.
      const baseUrl = getApiBaseUrlFromEnv();
      return makeApiError({
        name: res?.name || "SubmitFailed",
        message: res?.message || "Failed to submit score (offline mode).",
        status: res?.status ?? null,
        url: res?.url ?? (baseUrl ? joinUrl(baseUrl, "/scores") : null),
        method: "POST",
        isNetwork: Boolean(res?.isNetwork ?? true),
        isTimeout: Boolean(res?.isTimeout ?? false),
        isMock: !baseUrl || res?.name === "BackendNotConfigured",
        details: { payload: safePayload, upstream: res?.details ?? res ?? null }
      });
    },

    // PUBLIC_INTERFACE
    async getProfile() {
      /** Get current user profile (mock fallback on failure). */
      const res = await _requestJson("/profile", { method: "GET" });

      if (res && res.ok) {
        // Ensure we always return an object.
        if (res.data && typeof res.data === "object") return { ...res.data, isMock: false };
        return { profile: res.data, isMock: false };
      }

      return makeMockProfile();
    },

    // PUBLIC_INTERFACE
    async updateProfile(payload) {
      /**
       * Update current user profile.
       * Offline/mock behavior:
       * - if backend fails, return a mock profile merged with payload and `isMock: true`
       */
      const safePayload = payload && typeof payload === "object" ? payload : {};

      const res = await _requestJson("/profile", { method: "PUT", body: safePayload, retries: 0 });

      if (res && res.ok) {
        if (res.data && typeof res.data === "object") return { ...res.data, isMock: false };
        return { updated: res.data, isMock: false };
      }

      // Mock-friendly: return a local merged profile rather than only an error.
      const offline = makeMockProfile();
      return { ...offline, ...(safePayload || {}), isMock: true };
    },

    // PUBLIC_INTERFACE
    getBaseUrl() {
      /** Return the resolved backend base URL (or empty string if not configured). */
      return getApiBaseUrlFromEnv();
    }
  };
}

/**
 * Default singleton client for app usage.
 * Keep it simple now; tests can use createRestApiClient({ fetchImpl }).
 */
export const apiClient = createRestApiClient();

/**
 * Back-compat aliases (existing code used healthCheck()).
 * Keeping these ensures we don't break existing imports while step 01.04 requires `health()`.
 */
// PUBLIC_INTERFACE
export function healthCheck() {
  /** Backwards compatible health check alias. */
  return apiClient.health();
}

// PUBLIC_INTERFACE
export function getTopScores() {
  /** Backwards compatible shortcut for singleton client. */
  return apiClient.getTopScores();
}

// PUBLIC_INTERFACE
export function submitScore(payload) {
  /** Backwards compatible shortcut for singleton client. */
  return apiClient.submitScore(payload);
}

// PUBLIC_INTERFACE
export function getProfile() {
  /** Backwards compatible shortcut for singleton client. */
  return apiClient.getProfile();
}

// PUBLIC_INTERFACE
export function updateProfile(payload) {
  /** Backwards compatible shortcut for singleton client. */
  return apiClient.updateProfile(payload);
}
