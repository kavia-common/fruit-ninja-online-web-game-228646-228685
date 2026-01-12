/**
 * REST API client for the Fruit Ninja Online frontend.
 *
 * Goals:
 * - Reads API base URL from env (REACT_APP_API_BASE or REACT_APP_BACKEND_URL).
 * - Provides high-level methods (healthCheck, getTopScores, submitScore, getProfile, updateProfile).
 * - Robust error handling (timeouts, JSON parsing, HTTP errors).
 * - Retries for idempotent GET requests.
 * - Graceful degradation: if backend is missing/unreachable, return mocked data
 *   (or a clear error object for non-idempotent operations like submitScore).
 */

/**
 * @typedef {Object} ApiError
 * @property {true} ok Always false for errors; provided for ergonomic branching
 * @property {string} name Machine-readable error name
 * @property {string} message Human-readable message
 * @property {number|null} status HTTP status if available
 * @property {string|null} url Request URL if available
 * @property {string|null} method HTTP method
 * @property {boolean} isNetwork True if request failed due to network/connection issues
 * @property {boolean} isTimeout True if request timed out
 * @property {any|null} details Optional extra details (e.g., response body, parse error)
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} ok
 * @property {"remote"|"offline"} mode
 * @property {string|null} baseUrl
 * @property {number} latencyMs
 * @property {string|null} message
 * @property {ApiError|null} error
 */

/**
 * @typedef {Object} ScoreRow
 * @property {string} name
 * @property {number} score
 * @property {string} [createdAt]
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
  const a = safeTrim(process.env.REACT_APP_API_BASE);
  const b = safeTrim(process.env.REACT_APP_BACKEND_URL);
  const raw = a || b;
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
    details: partial?.details ?? null
  };
  return err;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
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
 * Low-level request helper. Returns `{ ok: true, data, status }` or `{ ok: false, ...ApiError }`.
 * Retries only for GET requests (idempotent) by default.
 */
async function requestJson(path, options = {}) {
  const baseUrl = getApiBaseUrlFromEnv();
  const url = joinUrl(baseUrl, path);

  const method = (options.method || "GET").toUpperCase();
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  // When there is no base URL, we cannot issue any network request.
  if (!baseUrl) {
    return makeApiError({
      name: "BackendNotConfigured",
      message:
        "Backend URL not configured. Set REACT_APP_API_BASE or REACT_APP_BACKEND_URL to enable online features.",
      status: null,
      url: null,
      method,
      isNetwork: true,
      isTimeout: false,
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
  let lastErr = null;

  while (attempt <= maxRetries) {
    try {
      const res = await fetchWithTimeout(
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
        // Normalize error information.
        return makeApiError({
          name: "HttpError",
          message: `HTTP ${res.status} ${res.statusText || ""}`.trim(),
          status: res.status,
          url,
          method,
          isNetwork: false,
          isTimeout: false,
          details: parsed
        });
      }

      return {
        ok: true,
        status: res.status,
        data: parsed
      };
    } catch (e) {
      // AbortError is our timeout path (or an explicit abort elsewhere).
      const isAbort = e && typeof e === "object" && String(e.name) === "AbortError";
      lastErr = makeApiError({
        name: isAbort ? "TimeoutError" : "NetworkError",
        message: isAbort
          ? `Request timed out after ${timeoutMs}ms`
          : "Network error while contacting backend",
        status: null,
        url,
        method,
        isNetwork: true,
        isTimeout: isAbort,
        details: { error: String(e) }
      });

      // Retry only on GET, and only if attempts remain.
      if (method === "GET" && attempt < maxRetries) {
        const backoffMs = 250 * Math.pow(2, attempt); // 250, 500, 1000...
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }
      return lastErr;
    }
  }

  // Should not happen, but keep a safe fallback.
  return lastErr || makeApiError({ name: "UnknownError", message: "Unknown request failure", url, method });
}

// ---------- Mock/offline data helpers ----------

function makeMockScores() {
  /** @type {ScoreRow[]} */
  return [
    { name: "You (Offline)", score: 12, createdAt: new Date().toISOString() },
    { name: "Swift Slicer", score: 20, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { name: "Fruit Fan", score: 16, createdAt: new Date(Date.now() - 3600000).toISOString() }
  ].sort((a, b) => b.score - a.score);
}

function makeMockProfile() {
  return {
    id: "offline",
    name: "Offline Player",
    avatar: null,
    preferences: {
      theme: "dark"
    }
  };
}

// ---------- High-level API surface ----------

/**
 * PUBLIC_INTERFACE
 * Create a client instance. You can inject a custom fetch implementation for tests/mocks.
 */
export function createRestApiClient({ fetchImpl } = {}) {
  /** Create a REST API client (optionally inject fetch for tests). */
  if (fetchImpl && typeof fetchImpl === "function") {
    // Swap global fetch used in requestJson helpers by temporarily shadowing.
    // We do this by binding a private wrapper that uses fetchImpl.
    // Keeping this lightweight avoids adding dependencies.
    const _fetch = fetchImpl;

    // Local copies of helpers that use injected fetch.
    async function _fetchWithTimeout(url, options, timeoutMs) {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        return await _fetch(url, { ...options, signal: ctrl.signal });
      } finally {
        clearTimeout(id);
      }
    }

    async function _requestJson(path, options = {}) {
      const baseUrl = getApiBaseUrlFromEnv();
      const url = joinUrl(baseUrl, path);

      const method = (options.method || "GET").toUpperCase();
      const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

      if (!baseUrl) {
        return makeApiError({
          name: "BackendNotConfigured",
          message:
            "Backend URL not configured. Set REACT_APP_API_BASE or REACT_APP_BACKEND_URL to enable online features.",
          status: null,
          url: null,
          method,
          isNetwork: true,
          isTimeout: false,
          details: { missingEnv: ["REACT_APP_API_BASE", "REACT_APP_BACKEND_URL"] }
        });
      }

      const headers = {
        Accept: "application/json",
        ...(options.headers || {})
      };

      const hasBody = options.body !== undefined && options.body !== null;
      const body =
        hasBody && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : hasBody
            ? options.body
            : undefined;

      if (
        hasBody &&
        typeof headers["Content-Type"] === "undefined" &&
        typeof headers["content-type"] === "undefined"
      ) {
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
          const res = await _fetchWithTimeout(
            url,
            { method, headers, body, credentials: "omit" },
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
              details: parsed
            });
          }

          return { ok: true, status: res.status, data: parsed };
        } catch (e) {
          const isAbort = e && typeof e === "object" && String(e.name) === "AbortError";
          const err = makeApiError({
            name: isAbort ? "TimeoutError" : "NetworkError",
            message: isAbort
              ? `Request timed out after ${timeoutMs}ms`
              : "Network error while contacting backend",
            status: null,
            url,
            method,
            isNetwork: true,
            isTimeout: isAbort,
            details: { error: String(e) }
          });

          if (method === "GET" && attempt < maxRetries) {
            await sleep(250 * Math.pow(2, attempt));
            attempt += 1;
            continue;
          }
          return err;
        }
      }

      return makeApiError({ name: "UnknownError", message: "Unknown request failure", url, method });
    }

    return buildHighLevelApi(_requestJson);
  }

  return buildHighLevelApi(requestJson);
}

function buildHighLevelApi(_requestJson) {
  return {
    // PUBLIC_INTERFACE
    async healthCheck() {
      /** Check whether backend is reachable. Returns a structured result with mode + latency. */
      const baseUrl = getApiBaseUrlFromEnv();
      const t0 = performance.now();

      // If not configured, this is an "offline mode" success (the UI can still function).
      if (!baseUrl) {
        return /** @type {HealthCheckResult} */ ({
          ok: true,
          mode: "offline",
          baseUrl: null,
          latencyMs: 0,
          message: "Offline mode: backend URL not configured.",
          error: null
        });
      }

      const res = await _requestJson(resolveHealthPath(), { method: "GET", retries: 1, timeoutMs: 3500 });
      const latencyMs = Math.max(0, Math.round(performance.now() - t0));

      if (res && res.ok) {
        return /** @type {HealthCheckResult} */ ({
          ok: true,
          mode: "remote",
          baseUrl,
          latencyMs,
          message: "Backend reachable",
          error: null
        });
      }

      // Backend exists but is down/unreachable — still return ok:false but with structured error.
      return /** @type {HealthCheckResult} */ ({
        ok: false,
        mode: "offline",
        baseUrl,
        latencyMs,
        message: "Backend unreachable; continuing in solo mode.",
        error: res
      });
    },

    // PUBLIC_INTERFACE
    async getTopScores() {
      /** Get leaderboard scores (mocked fallback on failure). */
      const res = await _requestJson("/scores/top", { method: "GET" });

      if (res && res.ok) {
        // Expect API returns array (but tolerate different shapes)
        if (Array.isArray(res.data)) return res.data;
        if (res.data && Array.isArray(res.data.scores)) return res.data.scores;
        return res.data;
      }

      // Graceful degradation: return mocked leaderboard.
      return makeMockScores();
    },

    // PUBLIC_INTERFACE
    async submitScore({ name, score }) {
      /** Submit a score. If backend is missing, return a clear error object (cannot truly persist). */
      const payload = {
        name: safeTrim(name) || "Anonymous",
        score: Number.isFinite(score) ? score : 0
      };

      const res = await _requestJson("/scores", { method: "POST", body: payload, retries: 0 });

      if (res && res.ok) return res.data;

      // Non-idempotent; do not pretend it succeeded. Return a consistent error object.
      return (
        res ||
        makeApiError({
          name: "SubmitFailed",
          message: "Failed to submit score (offline mode).",
          status: null,
          url: null,
          method: "POST",
          isNetwork: true,
          isTimeout: false,
          details: { payload }
        })
      );
    },

    // PUBLIC_INTERFACE
    async getProfile() {
      /** Get current user profile (mocked fallback on failure). */
      const res = await _requestJson("/profile", { method: "GET" });

      if (res && res.ok) return res.data;

      return makeMockProfile();
    },

    // PUBLIC_INTERFACE
    async updateProfile(data) {
      /** Update current user profile. If backend is missing/unreachable, return a clear error object. */
      const payload = data && typeof data === "object" ? data : {};

      const res = await _requestJson("/profile", { method: "PUT", body: payload, retries: 0 });

      if (res && res.ok) return res.data;

      return (
        res ||
        makeApiError({
          name: "UpdateFailed",
          message: "Failed to update profile (offline mode).",
          status: null,
          url: null,
          method: "PUT",
          isNetwork: true,
          isTimeout: false,
          details: { payload }
        })
      );
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
