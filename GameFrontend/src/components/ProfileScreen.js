import React, { useEffect, useMemo, useState } from "react";
import { useProfile } from "../profile/useProfile";

function safeTrim(s) {
  return typeof s === "string" ? s.trim() : "";
}

function validateName(name) {
  const n = safeTrim(name);
  if (!n) return "Display name is required.";
  if (n.length > 24) return "Display name must be 24 characters or less.";
  return "";
}

function validateAvatar(avatar) {
  const a = safeTrim(avatar);
  if (!a) return "Avatar is required (emoji or image URL).";
  if (a.length > 120) return "Avatar is too long.";
  return "";
}

function isProbablyUrl(value) {
  const v = safeTrim(value);
  return /^https?:\/\//i.test(v);
}

function renderAvatar(avatar) {
  const a = safeTrim(avatar);
  if (!a) return null;

  if (isProbablyUrl(a)) {
    return (
      <img
        src={a}
        alt="Player avatar"
        style={{ width: 42, height: 42, borderRadius: 12, objectFit: "cover" }}
        onError={(e) => {
          // If URL fails, fallback to showing the raw value as text.
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  // Emoji or text-based avatar
  return (
    <div
      aria-label="Player avatar"
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        display: "grid",
        placeItems: "center",
        border: "1px solid var(--border-color)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 20,
        fontWeight: 900
      }}
    >
      {a.slice(0, 2)}
    </div>
  );
}

// PUBLIC_INTERFACE
export default function ProfileScreen({ onBack }) {
  /** Profile screen: edit display name + avatar. Uses REST when available; otherwise localStorage fallback. */
  const profileApi = useProfile({ auto: true });

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    // When profile loads/changes, seed form fields.
    setName(profileApi.profile?.name || "");
    setAvatar(profileApi.profile?.avatar || "");
  }, [profileApi.profile?.avatar, profileApi.profile?.name]);

  const errors = useMemo(() => {
    if (!touched) return { name: "", avatar: "" };
    return {
      name: validateName(name),
      avatar: validateAvatar(avatar)
    };
  }, [avatar, name, touched]);

  const canSave = useMemo(() => {
    const e1 = validateName(name);
    const e2 = validateAvatar(avatar);
    return !e1 && !e2 && !profileApi.saving;
  }, [avatar, name, profileApi.saving]);

  const handleSave = async () => {
    setTouched(true);

    const e1 = validateName(name);
    const e2 = validateAvatar(avatar);
    if (e1 || e2) return;

    await profileApi.save({ name: safeTrim(name), avatar: safeTrim(avatar) });
  };

  const gateText = profileApi.isSignedIn
    ? "You're set. Your name/avatar will be used for score submissions when online."
    : "Optional: set a display name + avatar to personalize scores. Gameplay is still available without this.";

  return (
    <div className="screen">
      <div className="card">
        <div className="pageHeaderRow" aria-label="Profile header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="resultLabel">Profile</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {profileApi.source === "remote" ? "Synced" : "Local"}
              {profileApi.profile?.isMock ? " (mock)" : ""}
            </div>
          </div>

          <button className="btn btn-secondary" onClick={onBack} aria-label="Back to previous screen">
            Back
          </button>
        </div>

        <h1 className="title" style={{ marginTop: 8 }}>
          Your Profile
        </h1>
        <p className="subtitle">{gateText}</p>

        <div className="profileHeader" aria-label="Current profile summary">
          <div className="profileAvatar">{renderAvatar(avatar || profileApi.profile?.avatar || "")}</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.2 }}>
              {safeTrim(profileApi.profile?.name) ? profileApi.profile.name : "Guest"}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {profileApi.loading ? "Loading profile…" : profileApi.isSignedIn ? "Signed in (basic)" : "Not signed in"}
              {profileApi.saving ? " • Saving…" : ""}
            </div>
          </div>
        </div>

        {profileApi.error ? (
          <div className="inlineAlert" role="status" aria-label="Profile status message">
            Could not reach backend; using local profile. You can still save changes.
          </div>
        ) : null}

        <div className="formGrid" aria-label="Profile form">
          <label className="field">
            <span className="fieldLabel">Display name</span>
            <input
              className="textInput"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              placeholder="e.g., Swift Slicer"
              maxLength={24}
              autoComplete="nickname"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <span className="fieldError">{errors.name}</span> : null}
          </label>

          <label className="field">
            <span className="fieldLabel">Avatar (emoji or image URL)</span>
            <input
              className="textInput"
              value={avatar}
              onChange={(e) => {
                setAvatar(e.target.value);
                setTouched(true);
              }}
              placeholder="e.g., 🥷 or https://…"
              maxLength={120}
              autoComplete="off"
              aria-invalid={Boolean(errors.avatar)}
            />
            {errors.avatar ? <span className="fieldError">{errors.avatar}</span> : null}
          </label>
        </div>

        <div className="actions" aria-label="Profile actions">
          <button className="btn btn-primary btn-large" onClick={handleSave} disabled={!canSave}>
            {profileApi.saving ? "Saving…" : "Save Profile"}
          </button>
          <button
            className="btn"
            onClick={() => {
              // Placeholder sign-in/sign-up: for now it just focuses the form and prompts input.
              setTouched(true);
            }}
          >
            Sign in / Sign up (placeholder)
          </button>
        </div>

        <div className="finePrint">
          <p className="muted" style={{ margin: 0 }}>
            This app uses an offline-first profile: localStorage is used as fallback. When backend endpoints are available, profile
            updates are sent via REST and cached locally.
          </p>
        </div>
      </div>
    </div>
  );
}
