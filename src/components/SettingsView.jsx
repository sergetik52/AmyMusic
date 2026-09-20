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
  
  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);

  useEffect(() => subscribeProfileSettings(setSettings), []);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
        setAvailableDevices(audioOutputs);
      }).catch(console.warn);
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
    } else {
      setCacheStats({ covers: coversCount, lyrics: lyricsCount, tracks: 0 });
    }

    return () => { isMounted = false; };
  }, [activeSubTab, audioCacheSize]);

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

  const handleHotkeyAssign = async (action) => {
    // Basic assignment logic placeholder
    console.log("Assign hotkey for", action);
  };

  // SVG Icons
  const IconMain = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>;
  const IconAudio = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;
  const IconCache = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v2c0 1.66 1.34 3 3 3h14c1.66 0 3-1.34 3-3v-2c0-1.66-1.34-3-3-3zm-4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>;
  const IconBinds = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>;

  return (
    <>
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
            {["profile", "general", "integrations"].map((tab) => (
              <div
                key={tab}
                onClick={() => { setActiveTab(tab); setActiveSubTab(tab === "general" ? "main" : "proxy"); }}
                className={`relative pb-4 text-xl font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  activeTab === tab ? "text-white" : "text-white/50 hover:text-[#ccc]"
                }`}
              >
                {tab === "profile" ? "Профиль" : tab === "general" ? "Общие" : "Интеграции"}
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
                    <div className="text-[28px] font-bold">{audioCacheSize || "0 MB"}</div>
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

                <div className="mt-10 flex flex-col gap-1.5">
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
                      <button className="bg-transparent border-none text-[#555] cursor-pointer text-sm font-medium flex items-center gap-1 hover:text-white transition" onClick={() => handleHotkeyAssign(bind.id)}>
                        {settings.globalBinds?.[bind.id] || "+ Назначить"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
