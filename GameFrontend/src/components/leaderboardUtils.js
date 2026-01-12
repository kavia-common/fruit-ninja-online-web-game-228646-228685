/**
 * Small UI utilities for leaderboard rendering.
 */

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

// PUBLIC_INTERFACE
export function formatScoreName(name) {
  /** Format a score row name for display, with anonymous fallback. */
  const n = safeTrim(name);
  return n || "Anonymous";
}

// PUBLIC_INTERFACE
export function formatScoreDate(input) {
  /** Format a score row date (ISO or Date-ish) into a compact, locale-friendly string. */
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";

  // Compact and readable on mobile; relies on user locale.
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// PUBLIC_INTERFACE
export function normalizeScoreRow(row) {
  /** Normalize a score row from backend/mock into a stable shape for rendering. */
  const createdAt = row?.createdAt || row?.timestamp || row?.date || null;

  return {
    name: formatScoreName(row?.name),
    score: Number.isFinite(row?.score) ? row.score : 0,
    createdAt,
    isMock: Boolean(row?.isMock)
  };
}
