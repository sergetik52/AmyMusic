const PROFILE_KEY = "amymusic.localProfile.v1";
const LEGACY_USERNAME_KEY = "amymusic_username";
const LEGACY_TOKEN_KEY = "amymusic_token";

export const DEFAULT_LOCAL_PROFILE = {
  id: "local",
  username: "Local",
  displayName: "Local",
  avatarUrl: ""
};

function readJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeProfile(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const displayName = String(source.displayName || source.username || DEFAULT_LOCAL_PROFILE.displayName).trim()
    || DEFAULT_LOCAL_PROFILE.displayName;

  return {
    id: String(source.id || DEFAULT_LOCAL_PROFILE.id),
    username: String(source.username || displayName || DEFAULT_LOCAL_PROFILE.username).trim()
      || DEFAULT_LOCAL_PROFILE.username,
    displayName,
    avatarUrl: String(source.avatarUrl || "").trim()
  };
}

export function getLocalProfile() {
  if (typeof window === "undefined") return { ...DEFAULT_LOCAL_PROFILE };

  const stored = readJson(window.localStorage.getItem(PROFILE_KEY));
  if (stored) return normalizeProfile(stored);

  const legacyUsername = window.localStorage.getItem(LEGACY_USERNAME_KEY);
  if (legacyUsername) {
    return normalizeProfile({
      username: legacyUsername,
      displayName: legacyUsername,
      avatarUrl: ""
    });
  }

  return { ...DEFAULT_LOCAL_PROFILE };
}

export function saveLocalProfile(patch = {}) {
  if (typeof window === "undefined") return { ...DEFAULT_LOCAL_PROFILE };

  const next = normalizeProfile({
    ...getLocalProfile(),
    ...patch
  });

  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  window.localStorage.setItem(LEGACY_USERNAME_KEY, next.username);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("amymusic:local-profile-changed", { detail: next }));
  return next;
}

export function ensureLocalProfile() {
  if (typeof window === "undefined") return { ...DEFAULT_LOCAL_PROFILE };

  const existing = readJson(window.localStorage.getItem(PROFILE_KEY));
  if (existing) {
    const normalized = normalizeProfile(existing);
    window.localStorage.setItem(LEGACY_USERNAME_KEY, normalized.username);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    return normalized;
  }

  const legacyUsername = window.localStorage.getItem(LEGACY_USERNAME_KEY);
  if (legacyUsername) {
    return saveLocalProfile({
      username: legacyUsername,
      displayName: legacyUsername
    });
  }

  return saveLocalProfile(DEFAULT_LOCAL_PROFILE);
}

export function subscribeLocalProfile(listener) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => listener(getLocalProfile());
  const handleCustom = (event) => listener(event.detail || getLocalProfile());

  window.addEventListener("storage", handleChange);
  window.addEventListener("amymusic:local-profile-changed", handleCustom);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("amymusic:local-profile-changed", handleCustom);
  };
}
