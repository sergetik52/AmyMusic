import { invoke, isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { listen } from '@tauri-apps/api/event';

// Drop-in replacement for Electron's amyMusicDesktop
export function initDesktopApi() {
  if (typeof window === 'undefined') return;
  if (!isTauri()) return;

  // Polyfill fetch for APIs that require CORS bypass
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    let urlStr = typeof input === 'string' ? input : (input?.url || '');
    if (urlStr.startsWith('/proxy/genius')) {
      urlStr = urlStr.replace('/proxy/genius', 'https://genius.com');
    }
    if (urlStr.startsWith('/api/soundcloud')) {
      urlStr = urlStr.replace('/api/soundcloud', 'https://api-v2.soundcloud.com');
    }
    if (urlStr.includes('api-v2.soundcloud.com') || 
        urlStr.includes('music.yandex.ru') || 
        urlStr.includes('api.music.yandex.net') || 
        urlStr.includes('genius.com') || 
        urlStr.includes('api.github.com')) {
      try {
        const options = init ? {
            method: init.method,
            headers: init.headers ? Object.fromEntries(new Headers(init.headers)) : undefined,
            body: typeof init.body === 'string' ? init.body : undefined
        } : undefined;
        
        const res = await invoke('proxy_fetch', { url: urlStr, options });
        return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            headers: new Headers(res.headers),
            text: async () => res.body_text,
            json: async () => JSON.parse(res.body_text)
        };
      } catch (e) {
        console.warn("Tauri proxy_fetch failed, falling back to native fetch", e);
        return originalFetch(input, init);
      }
    }
    return originalFetch(input, init);
  };

  window.amyMusicDesktop = {
    getAutoLaunch: async () => await isEnabled(),
    setAutoLaunch: async (enabled) => {
      if (enabled) await enable();
      else await disable();
      return true;
    },
    minimizeWindow: async () => invoke('minimize_window'),
    maximizeWindow: async () => invoke('maximize_window'),
    toggleFullscreen: async () => invoke('toggle_fullscreen'),
    closeWindow: async () => invoke('close_window'),
    setTrayEnabled: async (enabled) => {
      // Tray is handled in Rust, this might require a custom command or just ignore if it's always on
      return true;
    },
    
    // Helper for overlay
    _getOverlayConfig: () => {
      try {
        const data = JSON.parse(window.localStorage.getItem("amymusic.profileSettings.v1"));
        return {
          scale: Number(data?.overlayScale) || 1.0,
          position: data?.overlayPosition || "top"
        };
      } catch (e) {
        return { scale: 1.0, position: "top" };
      }
    },

    showWindow: async () => {
      // Handled natively by tray click in Rust, but if called from JS:
      const { Window } = await import('@tauri-apps/api/window');
      const win = Window.getCurrent();
      await win.show();
      await win.setFocus();
    },
    parsePlaylist: async (url) => invoke('parse_playlist_url', { url }),
    getBandlinkChart: async () => invoke('get_bandlink_chart'),
    setDiscordActivity: async (activity) => invoke('set_discord_activity', { activity }),
    setDiscordBotToken: async (token) => invoke('set_discord_bot_token', { token }),
    getDiscordBotToken: async () => invoke('get_discord_bot_token'),
    getAppVersion: async () => await getVersion(),
    updateSmtc: async (info) => invoke('update_smtc', { info }),
    clearSmtc: async () => invoke('clear_smtc'),
    toggleOverlay: async (enabled) => invoke('toggle_overlay_window', { enabled }),
    setOverlayRules: async (mode, apps) => invoke('set_overlay_rules', { mode, apps }),
    getForegroundApp: async () => invoke('get_foreground_app'),
    isOverlayVisible: async () => invoke('is_overlay_visible'),
    resizeOverlayWindow: async (expanded, forceScale, forcePosition) => {
      const cfg = window.amyMusicDesktop._getOverlayConfig();
      invoke('resize_overlay_window', { 
        expanded, 
        scale: forceScale !== undefined ? forceScale : cfg.scale,
        position: forcePosition !== undefined ? forcePosition : cfg.position
      });
    },
    broadcastOverlayState: async (payload) => invoke('broadcast_overlay_state', { payload }),
    broadcastOverlayCmd: async (payload) => invoke('broadcast_overlay_cmd', { payload }),
    requestOverlayState: async () => invoke('request_overlay_state'),
    
    // Auto-update shim (we bypass checkUpdate since Tauri updater is not used, we kept the custom one)
    // Wait, the custom one expects checkUpdate to return { hasUpdate, latestVersion, downloadUrl, releaseNotes }
    // Actually, checkUpdate in main.cjs fetched from github! We need to port that!
    checkUpdate: async () => {
      const currentVersion = await getVersion();
      try {
        const res = await fetch("https://api.github.com/repos/sergetik52/AmyMusic/releases/latest");
        const data = await res.json();
        
        const latestVersion = data.tag_name.replace("v", "");
        if (latestVersion !== currentVersion) {
          const exeAsset = data.assets.find(a => a.name.endsWith(".exe"));
          if (exeAsset) {
            return {
              hasUpdate: true,
              latestVersion,
              downloadUrl: exeAsset.browser_download_url,
              releaseNotes: data.body
            };
          }
        }
      } catch (e) {
        console.error("Update check failed", e);
      }
      return { hasUpdate: false };
    },
    startUpdate: async (downloadUrl) => {
      try {
        await invoke('start_update', { downloadUrl });
        return { success: true };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    },
    onUpdateProgress: (callback) => {
      let unlisten = null;
      listen('amymusic:update-progress', (event) => {
        callback(event.payload);
      }).then(u => unlisten = u);
      return () => { if (unlisten) unlisten(); };
    },
    
    registerHotkey: async (action, combo) => {
      if (!combo || typeof combo !== 'string') return false;
      
      const normalizeShortcut = (str) => {
        return str.trim()
          .replace(/\bCommandOrControl\b/gi, 'CmdOrCtrl')
          .replace(/\bControl\b/gi, 'Ctrl')
          .replace(/\bCommand\b/gi, 'Cmd')
          .replace(/\bOption\b/gi, 'Alt')
          .replace(/\bMediaNextTrack\b/gi, 'MediaTrackNext')
          .replace(/\bMediaPreviousTrack\b/gi, 'MediaTrackPrevious')
          .replace(/\bMediaPrevTrack\b/gi, 'MediaTrackPrevious')
          .replace(/\bArrowUp\b/gi, 'Up')
          .replace(/\bArrowDown\b/gi, 'Down')
          .replace(/\bArrowLeft\b/gi, 'Left')
          .replace(/\bArrowRight\b/gi, 'Right');
      };

      const normalized = normalizeShortcut(combo);
      if (!normalized) return false;

      try {
        console.log(`[Hotkey] Registering "${action}" -> "${normalized}" (raw: "${combo}")`);
        
        try {
          const { isRegistered, unregister } = await import('@tauri-apps/plugin-global-shortcut');
          if (await isRegistered(normalized)) {
            await unregister(normalized);
          }
        } catch (_) {}

        await register(normalized, (event) => {
          if (!event || event.state === 'Pressed' || typeof event.state === 'undefined') {
            console.log(`[Hotkey] Triggered "${action}" via "${normalized}"`);
            window.dispatchEvent(new CustomEvent('amymusic:hotkey', { detail: action }));
          }
        });
        return true;
      } catch (e) {
        console.warn(`[Hotkey] Failed to register "${action}" ("${combo}" -> "${normalized}"):`, e);
        return false;
      }
    },
    unregisterAllHotkeys: async () => {
      try {
        await unregisterAll();
        return true;
      } catch (e) {
        console.warn('[Hotkey] Failed to unregister all shortcuts:', e);
        return false;
      }
    },
    onHotkey: (callback) => {
      const handler = (e) => callback(e.detail);
      window.addEventListener('amymusic:hotkey', handler);
      return () => window.removeEventListener('amymusic:hotkey', handler);
    }
  };

  // Listen for SMTC media key buttons from Tauri Rust side
  listen('smtc-button', (event) => {
    if (event.payload) {
      window.dispatchEvent(new CustomEvent('amymusic:hotkey', { detail: event.payload }));
    }
  }).catch((err) => console.warn('Failed to listen for smtc-button', err));
}

// Global window event listeners (active in all environments)
if (typeof window !== "undefined") {
  // Disable default browser/WebView context menu (Назад, Обновить, Печать etc.)
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  }, true);

  // F11 Fullscreen toggle
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'F11' || e.keyCode === 122) {
      e.preventDefault();
      try {
        if (isTauri()) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          const isFullscreen = await win.isFullscreen();
          await win.setFullscreen(!isFullscreen);
        } else {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        }
      } catch (_) {
        invoke('toggle_fullscreen').catch(() => {});
      }
    }
  }, true);
}
