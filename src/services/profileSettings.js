const PROFILE_SETTINGS_KEY = "amymusic.profileSettings.v1";

export const defaultProfileSettings = {
  appearance: {
    themePreset: "amy", // "amy", "dotify", "cyberpunk", "midnight", "oled", "sunset"
    accentColor: "#8341EF",
    glassBlur: "medium", // "none", "low", "medium", "high"
    playerStyle: "floating", // "floating", "dock", "minimal"
    playerRounding: "xl", // "sharp", "xl", "pill"
    fullOpenGlow: "ambient", // "ambient", "mesh", "solid"
    fullOpenArtworkStyle: "glow", // "glow", "vinyl", "card"
    lyricsFontSize: "standard", // "standard", "large", "giant"
    lyricsInactiveEffect: "blur", // "blur", "dimmed"
    lyricsAlignment: "center", // "center", "left"
    coverRounding: "rounded", // "rounded", "extra", "circle"
    cardHoverEffect: "glow" // "glow", "zoom", "flat"
  },
  displayName: "Local",
  avatarUrl: "",
  soundCloudClientId: "",
  soundCloudClientSecret: "",
  soundCloudHttpProxies: "",
  appLaunchOnStartup: false,
  appMinimizeToTray: false,
  crossfadeEnabled: false,
  audioCacheEnabled: true,
  crossfadeSeconds: 4,
  discordRpcEnabled: true,
  audioOutputDevice: "default",
  audioQuality: "256", // "192", "256", "320", "1411"
  volumeNormalization: false,
  gaplessPlayback: false,
  bindsEnabled: false,
  globalBinds: {
    playPause: "",
    nextTrack: "",
    prevTrack: "",
    toggleLike: "",
    volumeUp: "",
    volumeDown: "",
    toggleOverlay: ""
  },
  lyricsSettings: {
    textSize: "lg", // "sm", "base", "lg", "xl"
    displayMode: "cover-text", // "cover-text", "hidden", "text-only"
    syncMode: "lines", // "lines", "words"
    textStyle: "blur" // "normal", "blur", "scale"
  }
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

export function saveProfileSettings(settings, silent = false) {
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
    discordRpcEnabled: settings?.discordRpcEnabled !== undefined ? Boolean(settings.discordRpcEnabled) : true,
    audioOutputDevice: String(settings?.audioOutputDevice || defaultProfileSettings.audioOutputDevice),
    audioQuality: String(settings?.audioQuality || defaultProfileSettings.audioQuality),
    volumeNormalization: Boolean(settings?.volumeNormalization),
    gaplessPlayback: Boolean(settings?.gaplessPlayback),
    bindsEnabled: Boolean(settings?.bindsEnabled),
    globalBinds: {
      ...defaultProfileSettings.globalBinds,
      ...(settings?.globalBinds || {})
    }
  };

  window.localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(normalized));
  
  if (!silent) {
    window.dispatchEvent(new CustomEvent("amymusic:profile-settings-changed", { detail: normalized }));
  }
  
  return normalized;
}

export function getPlayerRuntimeSettings() {
  const settings = getProfileSettings();
  return {
    crossfadeEnabled: settings.crossfadeEnabled,
    crossfadeSeconds: settings.crossfadeSeconds,
    audioOutputDevice: settings.audioOutputDevice,
    audioQuality: settings.audioQuality,
    volumeNormalization: settings.volumeNormalization,
    gaplessPlayback: settings.gaplessPlayback,
    bindsEnabled: settings.bindsEnabled,
    globalBinds: settings.globalBinds
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
