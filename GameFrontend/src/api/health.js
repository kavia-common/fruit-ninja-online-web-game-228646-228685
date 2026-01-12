import { useEffect, useMemo, useState } from "react";
import { apiClient } from "./restClient";

/**
 * PUBLIC_INTERFACE
 * Run a one-shot health check via the shared apiClient.
 *
 * Returns a HealthCheckResult from restClient.js.
 */
export async function runHealthCheck() {
  /** Run a one-shot health check (for screens/utilities). */
  return apiClient.health();
}

/**
 * PUBLIC_INTERFACE
 * React hook to track backend availability (or offline mode).
 *
 * This is intentionally lightweight and safe to call from any screen later.
 */
export function useBackendHealth(options = {}) {
  /** Hook: performs health check on mount and exposes result + refresh(). */
  const auto = typeof options.auto === "boolean" ? options.auto : true;

  const [state, setState] = useState(() => ({
    loading: auto,
    result: null,
    error: null
  }));

  const refresh = useMemo(() => {
    return async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await apiClient.health();
        setState({ loading: false, result, error: result && result.ok ? null : result?.error || null });
        return result;
      } catch (e) {
        const err = { ok: false, name: "HealthCheckException", message: String(e) };
        setState({ loading: false, result: null, error: err });
        return null;
      }
    };
  }, []);

  useEffect(() => {
    if (!auto) return;
    refresh();
  }, [auto, refresh]);

  return {
    loading: state.loading,
    result: state.result,
    error: state.error,
    refresh
  };
}
