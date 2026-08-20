const PROFILE_SETTINGS_KEY = "amymusic.profileSettings.v1";

export const defaultProfileSettings = {
  displayName: "Local profile",
  avatarUrl: "",
  soundCloudClientId: "",
  soundCloudClientSecret: "",
  soundCloudHttpProxies: "",
  appLaunchOnStartup: false,
  appMinimizeToTray: false,
  crossfadeEnabled: false,
  audioCacheEnabled: true,
  crossfadeSeconds: 4,
  discordRpcEnabled: true
};

function readJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getProfileSettings() {
  if (typeof window === "undefined") return defaultProfileSettings;

  const stored = readJson(window.localStorage.getItem(PROFILE_SETTINGS_KEY));
  return {
    ...defaultProfileSettings,
    ...(stored && typeof stored === "object" ? stored : {})
  };
}

export function saveProfileSettings(settings) {
  if (typeof window === "undefined") return defaultProfileSettings;

  const normalized = {
    ...defaultProfileSettings,
    ...settings,
    displayName: String(settings?.displayName || defaultProfileSettings.displayName).trim() || defaultProfileSettings.displayName,
    avatarUrl: String(settings?.avatarUrl || "").trim(),
    soundCloudClientId: String(settings?.soundCloudClientId || "").trim(),
    soundCloudClientSecret: String(settings?.soundCloudClientSecret || "").trim(),
    soundCloudHttpProxies: String(settings?.soundCloudHttpProxies || "")
      .split(/[\n,]+/)
      .map((proxy) => proxy.trim())
      .filter(Boolean)
      .join(","),
    appLaunchOnStartup: Boolean(settings?.appLaunchOnStartup),
    appMinimizeToTray: Boolean(settings?.appMinimizeToTray),
    crossfadeEnabled: Boolean(settings?.crossfadeEnabled),
    audioCacheEnabled: settings?.audioCacheEnabled !== undefined ? Boolean(settings.audioCacheEnabled) : true,
    crossfadeSeconds: Math.min(12, Math.max(1, Number(settings?.crossfadeSeconds) || defaultProfileSettings.crossfadeSeconds)),
    discordRpcEnabled: settings?.discordRpcEnabled !== undefined ? Boolean(settings.discordRpcEnabled) : true
  };

  window.localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("amymusic:profile-settings-changed", { detail: normalized }));
  return normalized;
}

export function getPlayerRuntimeSettings() {
  const settings = getProfileSettings();
  return {
    crossfadeEnabled: settings.crossfadeEnabled,
    crossfadeSeconds: settings.crossfadeSeconds
  };
}

export function subscribeProfileSettings(listener) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => listener(getProfileSettings());
  const handleCustomChange = (event) => listener(event.detail || getProfileSettings());

  window.addEventListener("storage", handleChange);
  window.addEventListener("amymusic:profile-settings-changed", handleCustomChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("amymusic:profile-settings-changed", handleCustomChange);
  };
}

export function getSoundCloudRuntimeSettings() {
  const settings = getProfileSettings();
  return {
    clientId: settings.soundCloudClientId,
    clientSecret: settings.soundCloudClientSecret,
    httpProxies: settings.soundCloudHttpProxies
  };
}
