import React, { useState, useEffect, useRef } from "react";
import { getProfileSettings, saveProfileSettings, subscribeProfileSettings } from "../services/profileSettings";
import { useAudioPlayer } from "../audio/AudioPlayerContext";

function SettingsToggle({ title, description, checked, onChange, disabled }) {
  return (
    <div className={`flex items-center justify-between py-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex-1 pr-5">
        <div className="text-base font-semibold mb-1.5">{title}</div>
        <div className="text-sm text-white/50 leading-relaxed">{description}</div>
      </div>
      <div
        onClick={() => onChange(!checked)}
        className={`w-12 h-6.5 rounded-full relative cursor-pointer transition-colors duration-300 shrink-0 border ${
          checked ? "bg-white border-white" : "bg-[#333] border-[#444]"
        }`}
        style={{ height: '26px' }}
      >
        <div
          className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-transform duration-300 ${
            checked ? "translate-x-[22px] bg-black" : "translate-x-0 bg-white"
          }`}
        />
      </div>
    </div>
  );
}

function SettingsCard({ icon, title, desc, active, onClick, extra }) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center p-5 rounded-xl border text-center cursor-pointer transition-all duration-200 ${
        active
          ? "bg-[#1f1f1f] border-white"
          : "bg-[#141414] border-[#2a2a2a] hover:border-[#555] hover:bg-[#1a1a1a]"
      }`}
    >
      <div className={`w-7 h-7 mb-3 transition-colors ${active ? "text-white" : "text-white/50"}`}>
        {icon}
      </div>
      <div className="text-[15px] font-semibold mb-1.5 flex items-center gap-1.5">
        {title} {extra}
      </div>
      <div className="text-[13px] text-white/50">{desc}</div>
    </div>
  );
}

function SettingsProxyCard({ icon, title, desc, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-5 p-5 rounded-xl border cursor-pointer transition-all duration-200 ${
        active
          ? "border-white"
          : "bg-[#141414] border-[#2a2a2a] hover:border-[#555] hover:bg-[#1a1a1a]"
      }`}
    >
      <div className={`w-6 h-6 shrink-0 transition-colors ${active ? "text-white" : "text-white/50"}`}>
        {icon}
      </div>
      <div>
        <div className="text-[15px] font-semibold mb-1">{title}</div>
        <div className="text-[13px] text-white/50">{desc}</div>
      </div>
    </div>
  );
}

import { AvatarCropperModal } from "./AvatarCropperModal";

export function SettingsView({ profileData, onProfileSave }) {
  const { isAudioCacheEnabled, clearAudioCache, audioCacheSize } = useAudioPlayer();
  const [activeTab, setActiveTab] = useState("profile");
  const [activeSubTab, setActiveSubTab] = useState("main");
  const [settings, setSettings] = useState(() => getProfileSettings());
  const [availableDevices, setAvailableDevices] = useState([]);
  const [cacheStats, setCacheStats] = useState({ covers: 0, lyrics: 0, tracks: 0 });
  const [draftProfile, setDraftProfile] = useState(profileData || { displayName: "", avatarUrl: "" });
  const [croppingImageSrc, setCroppingImageSrc] = useState(null);
  const [localCacheSize, setLocalCacheSize] = useState("0 MB");
  
  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);

  // App auto-updater state
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateMessage, setUpdateMessage] = useState("");
  const [latestDownloadUrl, setLatestDownloadUrl] = useState("");

  useEffect(() => {
    if (isDesktop && window.amyMusicDesktop?.getAppVersion) {
      window.amyMusicDesktop.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, [isDesktop]);

  const handleCheckOrStartUpdate = async () => {
    if (!isDesktop || !window.amyMusicDesktop) return;
    if (updateStatus === "has-update") {
      setUpdateStatus("downloading");
      setUpdateProgress(0);
      setUpdateMessage("Скачивание обновления и запуск инсталлятора...");

      const cleanup = window.amyMusicDesktop.onUpdateProgress?.((data) => {
        if (data?.percent !== undefined) {
          setUpdateProgress(data.percent);
        }
      });

      const res = await window.amyMusicDesktop.startUpdate(latestDownloadUrl);
      if (cleanup) cleanup();
      if (!res?.success) {
        setUpdateStatus("error");
        setUpdateMessage(res?.error || "Ошибка скачивания обновления.");
      }
      return;
    }

    setUpdateStatus("checking");
    setUpdateMessage("");
    const res = await window.amyMusicDesktop.checkUpdate();
    if (res?.hasUpdate) {
      setUpdateStatus("has-update");
      if (res.downloadUrl) setLatestDownloadUrl(res.downloadUrl);
      setUpdateMessage(`Доступна новая версия v${res.latestVersion}! ${res.releaseNotes || ""}`);
    } else {
      setUpdateStatus("up-to-date");
      setUpdateMessage("У вас установлена самая свежая версия приложения.");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  useEffect(() => subscribeProfileSettings(setSettings), []);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const getDevices = async () => {
        let devices = await navigator.mediaDevices.enumerateDevices();
        // Edge WebView2 hides device labels until microphone permission is granted
        if (devices.some(d => d.kind === "audiooutput" && !d.label)) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // stop immediately
            devices = await navigator.mediaDevices.enumerateDevices();
          } catch(e) {
            console.warn("Audio permission denied, device labels will be hidden");
          }
        }
        
        let audioOutputs = devices.filter((d) => d.kind === "audiooutput");
        
        // Remove redundant virtual devices from Windows/Edge
        audioOutputs = audioOutputs.filter((d) => {
          if (d.deviceId === 'default' || d.deviceId === 'communications') return false;
          if (/^(default|communications|по умолчанию|связь)\s*[-:]*\s*/i.test(d.label)) return false;
          return true;
        });

        setAvailableDevices(audioOutputs);
      };
      getDevices().catch(console.warn);
    }
  }, []);

  useEffect(() => {
    if (activeSubTab !== "cache") return;
    
    let isMounted = true;
    let coversCount = 0;
    let lyricsCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("amymusic_lyrics_")) {
        lyricsCount++;
      } else if (key.startsWith("yandex_avatar_")) { // yandex might still be in localStorage
        coversCount++;
      }
    }
    
    if (typeof window !== "undefined" && "caches" in window) {
      Promise.all([
        caches.open("amymusic-audio-cache-v1").then(c => c.keys()),
        caches.open("amymusic-images-cache-v1").then(c => c.keys())
      ]).then(([audioKeys, imageKeys]) => {
        if (!isMounted) return;
        setCacheStats({ 
          covers: coversCount + imageKeys.length, 
          lyrics: lyricsCount, 
          tracks: audioKeys.length 
        });
      }).catch(() => {
        if (isMounted) setCacheStats({ covers: coversCount, lyrics: lyricsCount, tracks: 0 });
      });
      
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(estimate => {
          if (!isMounted) return;
          
          let lsUsage = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key);
            lsUsage += (key ? key.length : 0) + (val ? val.length : 0);
          }
          // localStorage stores UTF-16, so approx 2 bytes per char
          lsUsage *= 2; 

          const usage = (estimate.usage || 0) + lsUsage;
          if (usage < 1024 * 1024 && usage > 0) {
            setLocalCacheSize((usage / 1024).toFixed(1) + " KB");
          } else {
            setLocalCacheSize((usage / (1024 * 1024)).toFixed(1) + " MB");
          }
        }).catch(() => {
          if (isMounted) setLocalCacheSize("0 MB");
        });
      }
    } else {
      setCacheStats({ covers: coversCount, lyrics: lyricsCount, tracks: 0 });
      setLocalCacheSize("0 MB");
    }

    return () => { isMounted = false; };
  }, [activeSubTab]);

  const handleClearTracks = async () => {
    if (typeof window !== "undefined" && "caches" in window) {
      await caches.delete("amymusic-audio-cache-v1");
      setCacheStats(s => ({ ...s, tracks: 0 }));
      if (clearAudioCache) clearAudioCache();
    }
  };

  const handleClearCovers = async () => {
    if (typeof window !== "undefined" && "caches" in window) {
      await caches.delete("amymusic-images-cache-v1");
    }
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("yandex_avatar_")) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setCacheStats(s => ({ ...s, covers: 0 }));
  };

  const handleClearLyrics = () => {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("amymusic_lyrics_")) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setCacheStats(s => ({ ...s, lyrics: 0 }));
  };

  const updateField = (field, value) => {
    const nextSettings = { ...settings, [field]: value };
    saveProfileSettings(nextSettings);
  };

  const updateProfileField = (field, value) => {
    setDraftProfile((current) => {
      const nextProfile = { ...current, [field]: value };
      if (onProfileSave) onProfileSave(nextProfile);
      return nextProfile;
    });
  };

  const handleAvatarFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setCroppingImageSrc(result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const [activeBindAction, setActiveBindAction] = useState(null);
  const [bindValue, setBindValue] = useState("");

  const handleHotkeyAssign = (action) => {
    setActiveBindAction(action);
    setBindValue("");
  };

  const handleHotkeyDelete = (action) => {
    const nextBinds = { ...settings.globalBinds };
    delete nextBinds[action];
    updateField("globalBinds", nextBinds);
    if (window.amyMusicDesktop?.registerHotkey) {
      window.amyMusicDesktop.unregisterAllHotkeys().then(() => {
        if (settings.bindsEnabled) {
          Object.entries(nextBinds).forEach(([act, combo]) => {
            if (combo) window.amyMusicDesktop.registerHotkey(act, combo);
          });
        }
      });
    }
  };

  const handleBindKeyDown = (e) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setActiveBindAction(null);
      return;
    }
    
    const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(e.key);
    if (isModifier) {
      // Wait for the main key
      return;
    }

    let combo = [];
    if (e.ctrlKey || e.metaKey) combo.push("Ctrl");
    if (e.altKey) combo.push("Alt");
    if (e.shiftKey) combo.push("Shift");
    
    // Process key name for bypass of Russian layout
    let keyName = e.key;
    if (e.code.startsWith("Key")) {
      keyName = e.code.replace("Key", ""); // "KeyA" -> "A"
    } else if (e.code.startsWith("Digit")) {
      keyName = e.code.replace("Digit", ""); // "Digit1" -> "1"
    } else if (e.code === "Space") {
      keyName = "Space";
    } else if (e.code === "ArrowUp") keyName = "Up";
    else if (e.code === "ArrowDown") keyName = "Down";
    else if (e.code === "ArrowLeft") keyName = "Left";
    else if (e.code === "ArrowRight") keyName = "Right";
    else if (e.code === "MediaPlayPause") keyName = "MediaPlayPause";
    else if (e.code === "MediaTrackNext") keyName = "MediaTrackNext";
    else if (e.code === "MediaTrackPrevious") keyName = "MediaTrackPrevious";
    else {
      // Fallback to capitalizing first letter
      keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1);
    }
    
    // Force modifiers for letters and numbers to prevent typing issues
    const isAlphanumeric = /^[A-Z0-9]$/.test(keyName);
    if (isAlphanumeric && combo.length === 0) {
      setBindValue("Требуется Ctrl, Alt или Shift!");
      setTimeout(() => setBindValue(""), 1500);
      return;
    }
    
    combo.push(keyName);
    const comboStr = combo.join("+");
    setBindValue(comboStr);
    
    setTimeout(() => {
      // Remove this combo from any other action to prevent duplicates
      const nextBinds = { ...(settings.globalBinds || {}) };
      Object.keys(nextBinds).forEach(key => {
        if (nextBinds[key] === comboStr) {
          delete nextBinds[key];
        }
      });
      nextBinds[activeBindAction] = comboStr;
      
      updateField("globalBinds", nextBinds);
      if (window.amyMusicDesktop?.registerHotkey) {
        window.amyMusicDesktop.unregisterAllHotkeys().then(() => {
          if (settings.bindsEnabled !== false) {
            Object.entries(nextBinds).forEach(([act, cb]) => {
              if (cb) window.amyMusicDesktop.registerHotkey(act, cb);
            });
          }
        });
      }
      setActiveBindAction(null);
    }, 200);
  };

  useEffect(() => {
    if (activeBindAction) {
      window.addEventListener("keydown", handleBindKeyDown);
      return () => window.removeEventListener("keydown", handleBindKeyDown);
    }
  }, [activeBindAction]);

  // SVG Icons
  const IconMain = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>;
  const IconAudio = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;
  const IconCache = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v2c0 1.66 1.34 3 3 3h14c1.66 0 3-1.34 3-3v-2c0-1.66-1.34-3-3-3zm-4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>;
  const IconBinds = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>;

  return (
    <>
      {activeBindAction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 flex flex-col items-center max-w-[400px] w-full shadow-2xl">
            <div className="text-xl font-bold mb-2 text-center">Назначение клавиши</div>
            <div className="text-sm text-white/50 text-center mb-8">
              Нажмите желаемую комбинацию клавиш...
            </div>
            
            <div className="bg-[#0a0a0a] border border-[#333] rounded-xl px-6 py-4 min-w-[200px] min-h-[60px] flex justify-center items-center mb-8">
              {bindValue ? (
                <div className="text-xl font-bold tracking-widest text-[#fff] animate-[pulse_1s_ease-in-out_infinite]">{bindValue}</div>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              )}
            </div>
            
            <button 
              className="px-6 py-2.5 rounded-full bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors text-sm font-semibold"
              onClick={() => setActiveBindAction(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {croppingImageSrc && (
        <AvatarCropperModal
          key="avatar-cropper-dialog"
          imageSrc={croppingImageSrc}
          onCrop={(croppedUrl) => {
            updateProfileField("avatarUrl", croppedUrl);
            setCroppingImageSrc(null);
          }}
          onCancel={() => setCroppingImageSrc(null)}
        />
      )}
      <div className="flex justify-center w-full h-full overflow-y-auto custom-scrollbar px-5 py-10 bg-[#0b0b0b] text-white">
        <div className="w-full max-w-[1200px]">
          {/* Top Nav */}
          <div className="flex gap-10 mb-8 border-b border-[#2a2a2a] overflow-x-auto no-scrollbar">
            {["profile", "general", "customization", "integrations"].map((tab) => (
              <div
                key={tab}
                onClick={() => { setActiveTab(tab); setActiveSubTab(tab === "general" ? "main" : "proxy"); }}
                className={`relative pb-4 text-xl font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  activeTab === tab ? "text-white" : "text-white/50 hover:text-[#ccc]"
                }`}
              >
                {tab === "profile" ? "Профиль" : tab === "general" ? "Общие" : tab === "customization" ? "Кастомизация" : "Интеграции"}
                {activeTab === tab && (
                  <div className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white pointer-events-none" />
                )}
              </div>
            ))}
          </div>

          {/* Tab Content: Профиль */}
          {activeTab === "profile" && (
            <div className="animate-[fadeIn_0.3s_ease-out] max-w-3xl">
              <div className="text-2xl font-bold mt-2.5">Ваш Профиль</div>
              <div className="text-sm text-white/50 mt-1 mb-8">Настройте отображение вашего аккаунта</div>
              
              <div className="flex items-center gap-8 mb-10">
                <div className="relative group w-[100px] h-[100px] shrink-0">
                  <img
                    src={draftProfile.avatarUrl || "/logo.png"}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover border border-[#333]"
                  />
                  <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
                    <svg className="w-6 h-6 mb-1 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white">Изменить</span>
                    <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleAvatarFileSelect} />
                  </label>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-2 text-white/70 uppercase tracking-widest">Отображаемое имя</div>
                  <input
                    type="text"
                    value={draftProfile.displayName || ""}
                    onChange={(e) => updateProfileField("displayName", e.target.value)}
                    placeholder="Введите ваше имя"
                    className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#444] transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Общие */}
        {activeTab === "general" && (
          <div className="animate-[fadeIn_0.3s_ease-out]">
            {/* Sub Nav */}
            <div className="flex gap-2.5 bg-[#141414] p-1.5 rounded-full mb-10 w-fit max-w-full overflow-x-auto no-scrollbar relative">
              {[
                { id: "main", icon: IconMain, label: "Основные" },
                { id: "audio", icon: IconAudio, label: "Аудио" },
                { id: "cache", icon: IconCache, label: "Кеш" },
                { id: "binds", icon: IconBinds, label: "Бинды" },
              ].map((sub) => (
                <div
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-[15px] font-semibold cursor-pointer whitespace-nowrap transition-all z-10 ${
                    activeSubTab === sub.id ? "bg-white text-black" : "text-white/50 hover:text-[#ddd]"
                  }`}
                >
                  <div className={`w-[18px] h-[18px] ${activeSubTab === sub.id ? "text-black" : "text-inherit"}`}>
                    {sub.icon}
                  </div>
                  {sub.label}
                </div>
              ))}
            </div>

            {/* Sections */}
            {activeSubTab === "main" && (
              <div className="animate-[fadeIn_0.3s_ease-out] max-w-3xl">
                <SettingsToggle 
                  title="Автозапуск" 
                  description="Запускать приложение при включении системы" 
                  checked={Boolean(settings.appLaunchOnStartup)} 
                  onChange={(v) => { updateField("appLaunchOnStartup", v); isDesktop && window.amyMusicDesktop?.setAutoLaunch?.(v); }} 
                  disabled={!isDesktop}
                />
                <SettingsToggle 
                  title="Сворачивать в трей вместо закрытия" 
                  description="Приложение останется работать в фоне" 
                  checked={Boolean(settings.appMinimizeToTray)} 
                  onChange={(v) => { updateField("appMinimizeToTray", v); isDesktop && window.amyMusicDesktop?.setTrayEnabled?.(v); }} 
                  disabled={!isDesktop}
                />
                <SettingsToggle 
                  title="Discord RPC" 
                  description="Показывать текущий трек в статусе Discord" 
                  checked={settings.discordRpcEnabled !== false} 
                  onChange={(v) => updateField("discordRpcEnabled", v)} 
                  disabled={!isDesktop}
                />

                <div className="flex items-center justify-between py-4">
                  <div className="flex-1 pr-5">
                    <div className="text-base font-semibold mb-1.5">Обновление приложения</div>
                    <div className="text-sm text-white/50 leading-relaxed">
                      {isDesktop ? `Установлена версия v${appVersion}` : "Доступно только в веб-версии"}
                      {updateMessage && <div className="mt-1 text-[#8341EF]">{updateMessage}</div>}
                    </div>
                  </div>
                  <div>
                    {isDesktop ? (
                      <button 
                        type="button" 
                        disabled={updateStatus === "checking" || updateStatus === "downloading"} 
                        onClick={handleCheckOrStartUpdate} 
                        className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full text-sm font-semibold transition disabled:opacity-50 relative overflow-hidden"
                      >
                        {updateStatus === "checking" && "Проверка..."}
                        {updateStatus === "idle" && "Проверить"}
                        {updateStatus === "up-to-date" && (
                          <span className="flex items-center gap-1.5">
                            Актуально
                            <svg className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        )}
                        {updateStatus === "has-update" && "Обновить 🚀"}
                        {updateStatus === "downloading" && `${updateProgress}%`}
                        {updateStatus === "downloading" && (
                          <div className="absolute left-0 bottom-0 h-1 bg-[#8341EF] transition-all" style={{ width: `${updateProgress}%` }} />
                        )}
                      </button>
                    ) : (
                      <a 
                        href="/api/download-app" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full text-sm font-semibold transition inline-block"
                      >
                        Скачать .exe
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t border-red-900/30">
                  <div className="text-xl font-bold text-red-500 mb-2">Опасная зона</div>
                  <div className="text-sm text-white/50 mb-6">Действия ниже невозможно отменить</div>
                  <button 
                    onClick={() => {
                      if (confirm("Вы уверены, что хотите сбросить все настройки приложения по умолчанию?")) {
                        localStorage.removeItem("amymusic-player-settings");
                        localStorage.removeItem("amymusic-audio-state");
                        window.location.reload();
                      }
                    }}
                    className="px-6 py-3 rounded-xl border border-red-500/50 text-red-500 font-semibold hover:bg-red-500/10 transition-colors"
                  >
                    Сбросить все настройки
                  </button>
                </div>
              </div>
            )}

            {activeSubTab === "audio" && (
              <div className="animate-[fadeIn_0.3s_ease-out]">
                <div className="text-2xl font-bold mt-2.5">Устройство вывода звука</div>
                <div className="text-sm text-white/50 mt-1 mb-5">Выберите аудиоустройство для воспроизведения музыки на этом компьютере</div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
                  <SettingsCard
                    icon={IconAudio}
                    title="По умолчанию"
                    desc="Системное устройство"
                    active={settings.audioOutputDevice === "default" || !settings.audioOutputDevice}
                    onClick={() => updateField("audioOutputDevice", "default")}
                  />
                  {availableDevices.map((device) => (
                    <SettingsCard
                      key={device.deviceId}
                      icon={IconAudio}
                      title={device.label || "Устройство вывода"}
                      desc="Устройство вывода"
                      active={settings.audioOutputDevice === device.deviceId}
                      onClick={() => updateField("audioOutputDevice", device.deviceId)}
                    />
                  ))}
                </div>

                <div className="text-2xl font-bold mt-12">Качество аудио</div>
                <div className="text-sm text-white/50 mt-1 mb-5">Выберите предпочтительное качество воспроизведения</div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
                  <SettingsCard icon={IconAudio} title="Низкое" desc="192 kbps" active={settings.audioQuality === "192"} onClick={() => updateField("audioQuality", "192")} />
                  <SettingsCard icon={IconAudio} title="Среднее" desc="256 kbps" active={settings.audioQuality === "256" || !settings.audioQuality} onClick={() => updateField("audioQuality", "256")} />
                  <SettingsCard icon={IconAudio} title="Высокое" desc="320 kbps" active={settings.audioQuality === "320"} onClick={() => updateField("audioQuality", "320")} />
                  <SettingsCard icon={IconAudio} title="Без потерь" desc="1411 kbps" extra={<span className="text-[#ff4b4b] text-base">💎</span>} active={settings.audioQuality === "1411"} onClick={() => updateField("audioQuality", "1411")} />
                </div>

                <div className="mt-12 max-w-3xl">
                  <SettingsToggle 
                    title="Нормализация громкости" 
                    description="Автоматическое выравнивание уровня громкости для всех треков" 
                    checked={Boolean(settings.volumeNormalization)} 
                    onChange={(v) => updateField("volumeNormalization", v)} 
                  />
                  <SettingsToggle 
                    title="Бесшовное воспроизведение" 
                    description="Плавный переход между треками без пауз и задержек" 
                    checked={Boolean(settings.gaplessPlayback)} 
                    onChange={(v) => updateField("gaplessPlayback", v)} 
                  />
                  <SettingsToggle 
                    title="Кроссфейд" 
                    description="Плавное затухание в конце трека и нарастание в начале следующего" 
                    checked={Boolean(settings.crossfadeEnabled)} 
                    onChange={(v) => updateField("crossfadeEnabled", v)} 
                  />
                </div>
              </div>
            )}

            {activeSubTab === "cache" && (
              <div className="animate-[fadeIn_0.3s_ease-out]">
                <div className="text-2xl font-bold mt-2.5">Кеш</div>
                <div className="text-sm text-white/50 mt-1 mb-7">Анализ локального дискового пространства и сохраненных файлов</div>
                
                <div className="bg-[#141414] rounded-2xl p-12 flex flex-col justify-center items-center mb-8">
                  <div className="w-[220px] h-[220px] rounded-full border-2 border-[#333] flex flex-col justify-center items-center relative mb-8">
                    <div className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-[#666] border-r-[#666] -rotate-45" />
                    <div className="text-[28px] font-bold">{localCacheSize || "0 MB"}</div>
                    <div className="text-xs text-white/50 mt-1.5 uppercase tracking-wider">Занято</div>
                  </div>
                  
                  <div className="flex gap-8 text-center">
                    <div onClick={handleClearTracks} className="cursor-pointer transition-opacity hover:opacity-60" title="Нажмите, чтобы очистить кеш треков">
                      <div className="text-2xl font-bold">{cacheStats.tracks}</div>
                      <div className="text-[11px] text-white/50 uppercase tracking-widest mt-1">Треки</div>
                    </div>
                    <div onClick={handleClearCovers} className="cursor-pointer transition-opacity hover:opacity-60" title="Нажмите, чтобы очистить кеш обложек">
                      <div className="text-2xl font-bold">{cacheStats.covers}</div>
                      <div className="text-[11px] text-white/50 uppercase tracking-widest mt-1">Обложки</div>
                    </div>
                    <div onClick={handleClearLyrics} className="cursor-pointer transition-opacity hover:opacity-60" title="Нажмите, чтобы очистить кеш текстов">
                      <div className="text-2xl font-bold">{cacheStats.lyrics}</div>
                      <div className="text-[11px] text-white/50 uppercase tracking-widest mt-1">Тексты</div>
                    </div>
                  </div>
                </div>

                <div className="max-w-3xl">
                  <SettingsToggle 
                    title="Кеширование треков" 
                    description="Все треки будут сохранены в кеш для быстрого воспроизведения" 
                    checked={settings.audioCacheEnabled !== false} 
                    onChange={(v) => updateField("audioCacheEnabled", v)} 
                  />
                </div>
              </div>
            )}

            {activeSubTab === "binds" && (
              <div className="animate-[fadeIn_0.3s_ease-out] max-w-3xl">
                <SettingsToggle 
                  title="Активация горячих клавиш" 
                  description="Управляйте музыкой из любого приложения" 
                  checked={Boolean(settings.bindsEnabled)} 
                  onChange={(v) => updateField("bindsEnabled", v)} 
                />

                <div className={`mt-10 flex flex-col gap-1.5 transition-opacity ${!settings.bindsEnabled ? "opacity-30 pointer-events-none" : ""}`}>
                  {[
                    { id: "playPause", label: "Воспроизвести/пауза", desc: "Начинает или приостанавливает воспроизведение" },
                    { id: "nextTrack", label: "Следующий трек", desc: "Переключает на следующий трек в очереди" },
                    { id: "prevTrack", label: "Предыдущий трек", desc: "Переключает на предыдущий трек в очереди" },
                    { id: "toggleLike", label: "Добавить/убрать лайк", desc: "Добавляет или убирает лайк от текущего трека" },
                    { id: "volumeUp", label: "Увеличить громкость", desc: "Увеличивает громкость воспроизведения" },
                    { id: "volumeDown", label: "Уменьшить громкость", desc: "Уменьшает громкость воспроизведения" }
                  ].map((bind) => (
                    <div key={bind.id} className="flex items-center py-4 border-b border-[#2a2a2a] last:border-0">
                      <div className="mr-5 w-5 h-5 flex justify-center items-center text-white/50">{IconBinds}</div>
                      <div className="flex-1 pr-5">
                        <div className="text-base font-semibold mb-1.5">{bind.label}</div>
                        <div className="text-sm text-white/50">{bind.desc}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="bg-transparent border-none text-[#555] cursor-pointer text-sm font-medium flex items-center gap-1 hover:text-white transition" onClick={() => handleHotkeyAssign(bind.id)}>
                          {settings.globalBinds?.[bind.id] || "+ Назначить"}
                        </button>
                        {settings.globalBinds?.[bind.id] && (
                          <button 
                            className="bg-transparent border-none text-red-500/50 hover:text-red-500 cursor-pointer p-1 transition"
                            onClick={() => handleHotkeyDelete(bind.id)}
                            title="Удалить бинд"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Кастомизация */}
        {activeTab === "customization" && (
          <div className="animate-[fadeIn_0.3s_ease-out] max-w-3xl">
            <div className="text-2xl font-bold mt-2.5">Кастомизация</div>
            <div className="text-sm text-white/50 mt-1 mb-8">Настройте внешний вид и элементы интерфейса</div>

            <div className="mb-8">
              <div className="text-base font-semibold mb-2">Панель навигации</div>
              <div className="text-sm text-white/50 mb-5">Выберите режим работы бокового меню навигации</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SettingsCard
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M9 3v18" />
                      <path d="m14 9 3 3-3 3" />
                    </svg>
                  }
                  title="Динамическая"
                  desc="Панель раскрывается при наведении мыши (как сейчас)"
                  active={(settings.customization?.sidebarMode || "dynamic") === "dynamic"}
                  onClick={() => {
                    const currentCust = settings.customization || {};
                    updateField("customization", { ...currentCust, sidebarMode: "dynamic" });
                  }}
                />

                <SettingsCard
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M9 3v18" />
                      <path d="M14 12h4" />
                    </svg>
                  }
                  title="Статическая"
                  desc="Панель фиксируется, ее можно открывать и закрывать кнопкой"
                  active={settings.customization?.sidebarMode === "static"}
                  onClick={() => {
                    const currentCust = settings.customization || {};
                    updateField("customization", { ...currentCust, sidebarMode: "static" });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Интеграции */}
        {activeTab === "integrations" && (
          <div className="animate-[fadeIn_0.3s_ease-out]">
            <div className="flex gap-2.5 bg-[#141414] p-1.5 rounded-full mb-10 w-fit">
              <div className="flex items-center gap-2 px-6 py-3 rounded-full text-[15px] font-semibold cursor-pointer bg-white text-black">
                <div className="w-[18px] h-[18px]">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </div>
                Прокси
              </div>
            </div>

            <div className="animate-[fadeIn_0.3s_ease-out]">
              <div className="text-2xl font-bold mt-2.5">Прокси</div>
              <div className="text-sm text-white/50 mt-1 mb-5">Маршрутизация трафика и обход ограничений</div>
              
              <div className="flex flex-col gap-3 mt-5">
                <SettingsProxyCard 
                  icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>}
                  title="Выключен"
                  desc="Не использовать прокси и обход блокировок"
                  active={!settings.soundCloudHttpProxies}
                  onClick={() => updateField("soundCloudHttpProxies", "")}
                />
                <SettingsProxyCard 
                  icon={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>}
                  title="Встроенный"
                  desc="Использовать встроенный бесплатный прокси плеера"
                  active={Boolean(settings.soundCloudHttpProxies)}
                  onClick={() => updateField("soundCloudHttpProxies", "default")}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
