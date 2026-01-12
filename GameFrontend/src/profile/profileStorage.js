/**
 * Lightweight localStorage-based fallback for user profile.
 *
 * This file intentionally contains no external dependencies and is safe to use
 * even when the backend is unavailable.
 */

const STORAGE_KEY = "fn.profile.v1";

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getLocalStorage() {
  try {
    if (typeof window === "undefined") return null;
    if (!window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeDefaultLocalProfile() {
  return {
    id: "local",
    name: "",
    avatar: "",
    preferences: {},
    isMock: true
  };
}

// PUBLIC_INTERFACE
export function loadLocalProfile() {
  /** Load profile from localStorage (or return default). */
  const ls = getLocalStorage();
  if (!ls) return makeDefaultLocalProfile();

  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return makeDefaultLocalProfile();

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") return makeDefaultLocalProfile();

  return {
    ...makeDefaultLocalProfile(),
    ...parsed,
    name: safeTrim(parsed.name),
    avatar: safeTrim(parsed.avatar),
    isMock: true
  };
}

// PUBLIC_INTERFACE
export function saveLocalProfile(partial) {
  /** Save profile to localStorage (merges with existing local profile). */
  const ls = getLocalStorage();
  const current = loadLocalProfile();

  const next = {
    ...current,
    ...(partial && typeof partial === "object" ? partial : {}),
    name: safeTrim(partial?.name ?? current.name),
    avatar: safeTrim(partial?.avatar ?? current.avatar),
    isMock: true
  };

  if (ls) {
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota/storage errors; we still return `next`.
    }
  }

  return next;
}

// PUBLIC_INTERFACE
export function clearLocalProfile() {
  /** Clear local profile from storage. */
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
