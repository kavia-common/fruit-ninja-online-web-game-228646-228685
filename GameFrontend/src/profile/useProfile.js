import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/restClient";
import { loadLocalProfile, saveLocalProfile } from "./profileStorage";

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function normalizeProfile(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: typeof p.id === "string" && p.id ? p.id : "unknown",
    name: safeTrim(p.name),
    avatar: safeTrim(p.avatar),
    preferences: p.preferences && typeof p.preferences === "object" ? p.preferences : {},
    isMock: Boolean(p.isMock)
  };
}

/**
 * Attempt to fetch a profile from the backend. Return null if it's not usable.
 * We treat "Offline Player" mock from restClient as not-authenticated for the UI gate.
 */
async function tryRemoteGetProfile() {
  const p = await apiClient.getProfile();
  const normalized = normalizeProfile(p);
  if (!normalized) return null;

  // If restClient is in offline mode, it returns a mock profile; treat that as "remote unavailable".
  if (normalized.isMock) return null;

  return normalized;
}

function isProfileComplete(profile) {
  // "Basic auth gate": require name and avatar for "signed in".
  // Avatar can be an emoji or URL; we don't validate beyond non-empty.
  return Boolean(safeTrim(profile?.name)) && Boolean(safeTrim(profile?.avatar));
}

// PUBLIC_INTERFACE
export function useProfile(options = {}) {
  /**
   * Hook for reading/updating player profile with offline-first behavior.
   *
   * Behavior:
   * - loads localStorage profile immediately (fast, non-blocking)
   * - then best-effort tries remote getProfile() (if available) and merges into local
   * - updates via updateProfile() when possible; otherwise saves locally
   *
   * Options:
   * - auto: boolean (default true) to auto-load on mount
   */
  const auto = typeof options.auto === "boolean" ? options.auto : true;

  const [state, setState] = useState(() => {
    const local = normalizeProfile(loadLocalProfile());
    return {
      loading: auto,
      saving: false,
      error: null,
      profile: local,
      source: local?.isMock ? "local" : "unknown"
    };
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    // Always start from local; never block UI if remote fails.
    const local = normalizeProfile(loadLocalProfile());
    setState((s) => ({ ...s, profile: local, source: "local" }));

    try {
      const remote = await tryRemoteGetProfile();
      if (!remote) {
        setState((s) => ({ ...s, loading: false, error: null, profile: local, source: "local" }));
        return local;
      }

      // Merge remote -> local storage so it's available offline too.
      const mergedLocal = saveLocalProfile({
        id: remote.id || "remote",
        name: remote.name,
        avatar: remote.avatar,
        preferences: remote.preferences,
        isMock: false
      });

      const normalizedMerged = normalizeProfile({ ...remote, ...mergedLocal, isMock: false }) || remote;

      setState((s) => ({ ...s, loading: false, error: null, profile: normalizedMerged, source: "remote" }));
      return normalizedMerged;
    } catch (e) {
      // Keep local profile; show error as non-blocking status.
      setState((s) => ({
        ...s,
        loading: false,
        error: String(e),
        profile: local,
        source: "local"
      }));
      return local;
    }
  }, []);

  const save = useCallback(async (partial) => {
    const patch = partial && typeof partial === "object" ? partial : {};

    // Optimistic local update first (instant UI feedback).
    const nextLocal = saveLocalProfile(patch);
    const normalizedLocal = normalizeProfile(nextLocal);

    setState((s) => ({
      ...s,
      saving: true,
      error: null,
      profile: normalizedLocal || s.profile,
      source: "local"
    }));

    // Best-effort remote update; if it fails we keep local.
    try {
      const remoteRes = await apiClient.updateProfile({
        name: safeTrim(patch.name ?? normalizedLocal?.name),
        avatar: safeTrim(patch.avatar ?? normalizedLocal?.avatar),
        preferences: patch.preferences ?? normalizedLocal?.preferences
      });

      const normalizedRemote = normalizeProfile(remoteRes);

      // If remote returned mock, treat it as a failed remote update.
      if (!normalizedRemote || normalizedRemote.isMock) {
        setState((s) => ({ ...s, saving: false, error: null, profile: normalizedLocal || s.profile, source: "local" }));
        return normalizedLocal;
      }

      // Persist remote to local for offline continuity.
      const persisted = saveLocalProfile({
        id: normalizedRemote.id || "remote",
        name: normalizedRemote.name,
        avatar: normalizedRemote.avatar,
        preferences: normalizedRemote.preferences,
        isMock: false
      });

      const merged = normalizeProfile({ ...persisted, ...normalizedRemote, isMock: false }) || normalizedRemote;

      setState((s) => ({ ...s, saving: false, error: null, profile: merged, source: "remote" }));
      return merged;
    } catch (e) {
      setState((s) => ({
        ...s,
        saving: false,
        error: String(e),
        profile: normalizedLocal || s.profile,
        source: "local"
      }));
      return normalizedLocal;
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    refresh();
  }, [auto, refresh]);

  const derived = useMemo(() => {
    const complete = isProfileComplete(state.profile);
    return {
      isSignedIn: complete,
      isProfileComplete: complete
    };
  }, [state.profile]);

  return {
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    profile: state.profile,
    source: state.source,
    ...derived,
    refresh,
    save
  };
}
