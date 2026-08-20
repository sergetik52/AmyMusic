// Dotify Discord RPC Implementation for AmyMusic1
export async function invokeTauriCommand(cmd, payload) {
  if (typeof window === "undefined") return null;
  try {
    const invoke = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (typeof invoke === "function") {
      return await invoke(cmd, payload);
    }
  } catch (err) {
    // console.warn("[DiscordRPC] Tauri invoke failed:", err);
  }
  return null;
}

export async function updateDiscordStatus(track, isPlaying = false, currentTime = 0, customCover = null) {
  if (!track) {
    return await clearDiscordStatus();
  }

  try {
    const nowMs = Date.now();
    const startTime = isPlaying ? nowMs - Math.floor((currentTime || 0) * 1000) : undefined;
    const endTime = isPlaying && track.duration ? startTime + Math.floor(track.duration * 1000) : undefined;
    const sourceName = track.source || (String(track.id).includes("soundcloud") ? "soundcloud" : String(track.id).startsWith("upload-") ? "local" : "soundcloud");
    const largeImage = customCover || track.cover || track.artistAvatar || "amymusic";

    const payload = {
      action: {
        action: "update_status",
        details: track.title || "Unknown Track",
        state: track.artist || "Unknown Artist",
        large_image: largeImage,
        large_text: track.title || "AmyMusic",
        small_image: "soundcloud",
        small_text: "SoundCloud",
        start_time: startTime,
        end_time: endTime
      }
    };

    // 1. Send to Tauri Discord Plugin if running inside Desktop app
    await invokeTauriCommand("plugin:discord|action", payload);

    // 2. Send to Electron/Desktop bridge if running in desktop helper
    if (typeof window !== "undefined" && window.amyMusicDesktop?.setDiscordActivity) {
      window.amyMusicDesktop.setDiscordActivity({
        details: track.title || "Unknown Track",
        state: track.artist || "Unknown Artist",
        largeImageKey: largeImage,
        largeImageText: track.title || "AmyMusic",
        smallImageKey: isPlaying ? "play" : "pause",
        smallImageText: isPlaying ? "Playing" : "Paused",
        startTimestamp: startTime,
        endTimestamp: endTime
      });
    }
  } catch (err) {
    console.error("[DiscordRPC] updateDiscordStatus error:", err);
  }
}

export async function clearDiscordStatus() {
  try {
    await invokeTauriCommand("plugin:discord|action", { action: { action: "clear_status" } });
    if (typeof window !== "undefined" && window.amyMusicDesktop?.setDiscordActivity) {
      window.amyMusicDesktop.setDiscordActivity(null);
    }
  } catch (err) {
    console.error("[DiscordRPC] clearDiscordStatus error:", err);
  }
}
