import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Component } from "react";
import { WaveView } from "./components/WaveView";
import { CollectionView } from "./components/CollectionView";
import { ArtistView, AlbumView } from "./components/ArtistView";
import { FullPlayerOverlay } from "./components/FullPlayerOverlay";
import { AudioProvider, useAudioPlayer } from "./audio/AudioPlayerContext";
import { TrackMenuButton } from "./components/TrackContextMenu";
import AuthModal from "./components/AuthModal";
import { AvatarCropperModal } from "./components/AvatarCropperModal";
import { EqualizerModal } from "./components/EqualizerModal";
import { MyWaveSetupModal } from "./components/MyWaveSetupModal";
import { getUsername, removeAuthToken, getCollections, syncCollections, getWave, syncWave, getProfile, updateProfile, changePassword } from "./api";
import {
  buildArtistsFromTracks,
  getAlbumDetails,
  getPersonalWaveTracks,
  getRecommendedTracks,
  getTrackWaveTracks,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  searchTracks
} from "./services/soundCloudApi";
import {
  getProfileSettings,
  saveProfileSettings,
  subscribeProfileSettings
} from "./services/profileSettings";
import { useEscapeKey } from "./utils/useEscapeKey";
import "./main.css";

const initialNavigation = [
  { id: "search", label: "Поиск", icon: "/search.svg" },
  { id: "wave", label: "Моя волна", icon: "/wave.svg" },
  { id: "trends", label: "Чарты", icon: "/trends.svg" },
  { id: "collection", label: "Коллекция", icon: "/collection.svg" }
];

function Logo({ isCollapsed, onClick }) {
  return (
    <div 
      className="flex select-none items-center gap-3.5 cursor-pointer px-3 transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] overflow-hidden"
      onClick={onClick}
      title={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
    >
      <img
        src="/logo.png"
        alt="AmyMusic Logo"
        className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow-xl transition-transform hover:scale-105"
      />
      <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[100px] opacity-100"}`}>
        <div className="leading-tight whitespace-nowrap">
          <p className="text-[18px] font-black tracking-wide text-[#9E7DFF]">Amy</p>
          <p className="text-[18px] font-black tracking-wide text-[#9E7DFF]">Music</p>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ item, isActive, isCollapsed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[26px] text-left text-sm transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] overflow-hidden",
        isActive ? "font-medium text-[#8341EF]" : "text-white/50 hover:text-white/80"
      ].join(" ")}
      title={isCollapsed ? item.label : undefined}
    >
      <div
        className="h-5 w-5 shrink-0 bg-current transition-transform group-hover:scale-110"
        style={{
          maskImage: `url(${item.icon})`,
          WebkitMaskImage: `url(${item.icon})`,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskPosition: "center",
          WebkitMaskPosition: "center"
        }}
      />
      <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
        <span className="text-[14.9px] whitespace-nowrap">{item.label}</span>
      </span>
    </button>
  );
}

function ProfileSettingsModal({ settings, profileData, onClose, onSave, onProfileSave, onLogout }) {
  const { setIsEqualizerOpen } = useAudioPlayer();
  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);
  const [draft, setDraft] = useState(settings);
  const [draftProfile, setDraftProfile] = useState(profileData || { displayName: "", avatarUrl: "" });
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [croppingImageSrc, setCroppingImageSrc] = useState(null);

  // Password change state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // App auto-updater state
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateMessage, setUpdateMessage] = useState("");

  React.useEffect(() => {
    window.amyMusicDesktop?.getDiscordBotToken?.().then((t) => setDiscordBotToken(t || "")).catch(() => {});
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

      const res = await window.amyMusicDesktop.startUpdate();
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
      setUpdateMessage(`Доступна новая версия v${res.latestVersion}! ${res.releaseNotes || ""}`);
    } else {
      setUpdateStatus("up-to-date");
      setUpdateMessage("У вас установлена самая свежая версия приложения.");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  const tabs = [
    { id: "profile", label: "Профиль", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { id: "audio", label: "Аудио", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> },
    { id: "system", label: "Система", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: "developer", label: "Разработчик", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-.273l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> }
  ];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  };

  useEscapeKey(true, handleClose);

  // Auto-apply setting changes
  const updateField = (field, value) => {
    setDraft((current) => {
      const nextSettings = { ...current, [field]: value };
      onSave(nextSettings);
      return nextSettings;
    });
  };

  // Auto-apply profile changes
  const updateProfileField = (field, value) => {
    setDraftProfile((current) => {
      const nextProfile = { ...current, [field]: value };
      onProfileSave(nextProfile);
      return nextProfile;
    });
  };

  const handleDiscordBotTokenChange = (value) => {
    setDiscordBotToken(value);
    window.amyMusicDesktop?.setDiscordBotToken?.(value).catch(() => {});
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      setPasswordError("Заполните оба поля");
      return;
    }
    setPasswordLoading(true);
    setPasswordError("");
    setPasswordStatus("");
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordStatus("Пароль успешно изменён!");
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err.message || "Не удалось изменить пароль");
    } finally {
      setPasswordLoading(false);
    }
  };

  const fileInputRef = React.useRef(null);

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

  return (
    <React.Fragment>
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

      <div key="settings-overlay" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 sm:p-10 backdrop-blur-[10px]">
        <div
          key="settings-window-box"
          className={`relative flex w-full max-w-5xl h-[75vh] min-h-[500px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0c0c] text-white shadow-2xl ${isClosing ? "animate-[slideDownFade_0.25s_ease-in_forwards]" : "animate-slide-up-fade"}`}
        >
        {/* Close Button Top-Right */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-5 right-5 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition"
          title="Закрыть настройки"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Sidebar Navigation */}
        <div className="w-64 shrink-0 bg-white/[0.02] border-r border-white/5 flex flex-col pt-8 pb-4">
          <div className="px-6 mb-6">
            <h2 className="text-xl font-black tracking-tight text-white">Настройки</h2>
          </div>
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === tab.id ? "bg-[#8341EF] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white"}`}
              >
                <div className={`${activeTab === tab.id ? "opacity-100" : "opacity-60"}`}>
                  {tab.icon}
                </div>
                {tab.label}
              </button>
            ))}
          </nav>
          
          <div className="px-4 mt-auto">
            {onLogout ? (
              <button
                type="button"
                onClick={() => { handleClose(); onLogout(); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 py-2.5 text-xs font-bold text-red-400 hover:text-red-300 transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Выйти из аккаунта
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl border border-white/10 hover:bg-white/5 py-2.5 text-xs font-bold text-white/50 hover:text-white transition"
              >
                Закрыть
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
          {/* Subtle top gradient */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#8341EF]/5 to-transparent pointer-events-none" />
          
          <div className="absolute inset-0 overflow-y-auto px-10 py-12 custom-scrollbar">
            {activeTab === "profile" && (
              <div key="profile" className="animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-2xl font-black mb-8 text-white">Профиль</h3>
                
                <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
                  <div className="group relative flex h-40 w-40 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-[#121212] object-cover shadow-xl transition-all hover:border-[#8341EF]" onClick={() => fileInputRef.current?.click()}>
                    {draftProfile.avatarUrl ? (
                      <img src={draftProfile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <svg className="h-16 w-16 opacity-20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">Изменить</span>
                      </div>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarFileSelect} />
                  </div>
                  
                  <div className="flex-1 w-full space-y-6">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">Никнейм</label>
                      <input
                        type="text"
                        value={draftProfile.displayName}
                        onChange={(e) => updateProfileField("displayName", e.target.value)}
                        placeholder="Как вас зовут?"
                        className="w-full bg-white/[0.03] border border-white/10 focus:border-[#8341EF] focus:bg-white/[0.05] rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-white/20 outline-none transition-all shadow-inner"
                      />
                    </div>
                    
                    <div className="p-5 rounded-2xl bg-[#8341EF]/10 border border-[#8341EF]/20 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-[#8341EF] mb-1">AmyMusic Cloud</div>
                        <div className="text-xs font-semibold text-white/50">Коллекция и история прослушиваний синхронизируются</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Password Change Section */}
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#8341EF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Смена пароля
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Текущий пароль</label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/[0.03] border border-white/10 focus:border-[#8341EF] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-white/20 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Новый пароль</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/[0.03] border border-white/10 focus:border-[#8341EF] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-white/20 outline-none transition"
                      />
                    </div>
                  </div>

                  {passwordError && (
                    <div className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">
                      {passwordError}
                    </div>
                  )}
                  {passwordStatus && (
                    <div className="text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-xl">
                      {passwordStatus}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handlePasswordChangeSubmit}
                    disabled={passwordLoading}
                    className="rounded-xl bg-[#8341EF] hover:bg-[#7232d6] px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {passwordLoading ? "Изменение..." : "Сменить пароль"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "audio" && (
              <div key="audio" className="animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-2xl font-black mb-8 text-white">Аудио</h3>
                
                <div className="space-y-4">
                  {/* Equalizer Card */}
                  <div className="flex items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]">
                    <div>
                      <span className="block text-base font-bold text-white mb-1">
                        Эквалайзер
                      </span>
                      <span className="block text-xs font-semibold text-white/40">
                        Точная настройка частот и пресеты звучания
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEqualizerOpen(true)}
                      className="rounded-full bg-[#8341EF] hover:bg-[#7231dd] px-5 py-2 text-xs font-bold text-white transition active:scale-95 shrink-0"
                    >
                      Настроить
                    </button>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]">
                    <div>
                      <span className="block text-base font-bold text-white mb-1">Кроссфейд</span>
                      <span className="block text-xs font-semibold text-white/40">Плавное затухание в конце и начале треков</span>
                    </div>
                    <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${draft.crossfadeEnabled ? "bg-[#8341EF]" : "bg-white/10"}`}>
                      <div className={`absolute bottom-1 left-1 top-1 w-5 rounded-full bg-white transition-transform duration-300 shadow-md ${draft.crossfadeEnabled ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                    <input type="checkbox" checked={Boolean(draft.crossfadeEnabled)} onChange={(event) => updateField("crossfadeEnabled", event.target.checked)} className="hidden" />
                  </label>

                  <div className={`transition-all duration-500 overflow-hidden ${draft.crossfadeEnabled ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
                    <label className="block rounded-2xl border border-[#8341EF]/30 bg-[#8341EF]/5 p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm font-bold text-white/70">Длительность перехода</span>
                        <span className="text-sm font-black text-[#8341EF]">{draft.crossfadeSeconds || 4} сек</span>
                      </div>
                      <div className="player-seek-wrap relative h-5 w-full cursor-pointer">
                        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-black/50">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#8341EF] to-[#b388ff]" style={{ width: `${((draft.crossfadeSeconds || 4) / 12) * 100}%` }} />
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={Number(draft.crossfadeSeconds) || 4}
                          onChange={(event) => updateField("crossfadeSeconds", Number(event.target.value))}
                          className="player-seek-slider"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "system" && (
              <div key="system" className="animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-2xl font-black mb-8 text-white">Система</h3>

                {!isDesktop && (
                  <div className="mb-6 rounded-2xl border border-[#8341EF]/30 bg-[#8341EF]/10 p-5 backdrop-blur-md">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8341EF]/20 text-[#8341EF]">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Доступно в ПК приложении</h4>
                          <p className="text-xs font-semibold text-white/50">Автозапуск, сворачивание в трей и Discord RPC работают в десктопной версии AmyMusic</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-2xl">
                    {!isDesktop && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[1.5px] border border-white/10 rounded-2xl">
                        <span className="flex items-center gap-2 text-xs font-bold text-white/70 bg-black/80 px-4 py-2 rounded-full border border-white/10 shadow-xl">
                          🔒 Доступно только в ПК приложении
                        </span>
                      </div>
                    )}
                    <label className={`flex cursor-pointer items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors ${!isDesktop ? "opacity-30 filter blur-[1px] pointer-events-none select-none" : "hover:bg-white/[0.04]"}`}>
                      <div>
                        <span className="block text-base font-bold text-white mb-1">Автозапуск</span>
                        <span className="block text-xs font-semibold text-white/40">Запускать плеер при входе в систему</span>
                      </div>
                      <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${draft.appLaunchOnStartup ? "bg-[#8341EF]" : "bg-white/10"}`}>
                        <div className={`absolute bottom-1 left-1 top-1 w-5 rounded-full bg-white transition-transform duration-300 shadow-md ${draft.appLaunchOnStartup ? "translate-x-5" : "translate-x-0"}`} />
                      </div>
                      <input type="checkbox" disabled={!isDesktop} checked={Boolean(draft.appLaunchOnStartup)} onChange={(event) => updateField("appLaunchOnStartup", event.target.checked)} className="hidden" />
                    </label>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl">
                    {!isDesktop && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[1.5px] border border-white/10 rounded-2xl">
                        <span className="flex items-center gap-2 text-xs font-bold text-white/70 bg-black/80 px-4 py-2 rounded-full border border-white/10 shadow-xl">
                          🔒 Доступно только в ПК приложении
                        </span>
                      </div>
                    )}
                    <label className={`flex cursor-pointer items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors ${!isDesktop ? "opacity-30 filter blur-[1px] pointer-events-none select-none" : "hover:bg-white/[0.04]"}`}>
                      <div>
                        <span className="block text-base font-bold text-white mb-1">Сворачивать в трей</span>
                        <span className="block text-xs font-semibold text-white/40">Прятать окно вместо полного закрытия</span>
                      </div>
                      <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${draft.appMinimizeToTray ? "bg-[#8341EF]" : "bg-white/10"}`}>
                        <div className={`absolute bottom-1 left-1 top-1 w-5 rounded-full bg-white transition-transform duration-300 shadow-md ${draft.appMinimizeToTray ? "translate-x-5" : "translate-x-0"}`} />
                      </div>
                      <input type="checkbox" disabled={!isDesktop} checked={Boolean(draft.appMinimizeToTray)} onChange={(event) => updateField("appMinimizeToTray", event.target.checked)} className="hidden" />
                    </label>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl">
                    {!isDesktop && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[1.5px] border border-white/10 rounded-2xl">
                        <span className="flex items-center gap-2 text-xs font-bold text-white/70 bg-black/80 px-4 py-2 rounded-full border border-white/10 shadow-xl">
                          🔒 Доступно только в ПК приложении
                        </span>
                      </div>
                    )}
                    <label className={`flex cursor-pointer items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors ${!isDesktop ? "opacity-30 filter blur-[1px] pointer-events-none select-none" : "hover:bg-white/[0.04]"}`}>
                      <div>
                        <span className="block text-base font-bold text-white mb-1">Discord RPC</span>
                        <span className="block text-xs font-semibold text-white/40">Отображать прослушиваемый трек в статусе Discord</span>
                      </div>
                      <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${draft.discordRpcEnabled !== false ? "bg-[#8341EF]" : "bg-white/10"}`}>
                        <div className={`absolute bottom-1 left-1 top-1 w-5 rounded-full bg-white transition-transform duration-300 shadow-md ${draft.discordRpcEnabled !== false ? "translate-x-5" : "translate-x-0"}`} />
                      </div>
                      <input type="checkbox" disabled={!isDesktop} checked={draft.discordRpcEnabled !== false} onChange={(event) => updateField("discordRpcEnabled", event.target.checked)} className="hidden" />
                    </label>
                  </div>

                  {/* 1-Click App Auto-Updater Card */}
                  <div className="rounded-2xl border border-[#8341EF]/30 bg-[#8341EF]/10 p-5 transition-colors hover:bg-[#8341EF]/15">
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <span className="block text-base font-bold text-white mb-1">
                          Обновление приложения
                        </span>
                        <span className="block text-xs font-semibold text-white/50">
                          {isDesktop
                            ? `Установленная версия: v${appVersion}`
                            : "Веб-версия AmyMusic (обновляется автоматически)"}
                        </span>
                      </div>
                      {isDesktop ? (
                        <button
                          type="button"
                          disabled={updateStatus === "checking" || updateStatus === "downloading"}
                          onClick={handleCheckOrStartUpdate}
                          className="rounded-full bg-[#8341EF] hover:bg-[#7231dd] px-5 py-2.5 text-xs font-bold text-white transition active:scale-95 shrink-0 disabled:opacity-50"
                        >
                          {updateStatus === "checking" && "Проверка..."}
                          {updateStatus === "idle" && "Проверить обновления"}
                          {updateStatus === "up-to-date" && "Версия актуальна ✓"}
                          {updateStatus === "has-update" && "Обновить в 1 клик 🚀"}
                          {updateStatus === "downloading" && `Загрузка ${updateProgress}%...`}
                        </button>
                      ) : (
                        <a
                          href="/api/download-app"
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="rounded-full bg-[#8341EF] hover:bg-[#7231dd] px-5 py-2.5 text-xs font-bold text-white transition active:scale-95 shrink-0"
                        >
                          Скачать .exe
                        </a>
                      )}
                    </div>
                    {updateStatus === "downloading" && (
                      <div className="mt-4 w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#8341EF] h-full transition-all duration-300 rounded-full"
                          style={{ width: `${updateProgress}%` }}
                        />
                      </div>
                    )}
                    {updateMessage && (
                      <p className="mt-3 text-xs font-semibold text-white/70">{updateMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "developer" && (
              <div key="developer" className="animate-[fadeIn_0.3s_ease-out]">
                <h3 className="text-2xl font-black mb-8 text-white">Для разработчиков</h3>
                
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <div className="text-xs font-semibold text-yellow-500/80 leading-relaxed">
                        Эти настройки предназначены для отладки приложения. Не изменяйте их, если не уверены в том, что делаете.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">SoundCloud Client ID</label>
                      <input
                        value={draft.soundCloudClientId}
                        onChange={(event) => updateField("soundCloudClientId", event.target.value)}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none focus:border-[#8341EF] transition-colors"
                        placeholder="client_id"
                        spellCheck={false}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">SoundCloud Client Secret</label>
                      <input
                        value={draft.soundCloudClientSecret}
                        onChange={(event) => updateField("soundCloudClientSecret", event.target.value)}
                        type="password"
                        className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none focus:border-[#8341EF] transition-colors"
                        placeholder="Опционально"
                        spellCheck={false}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">HTTP Proxies (по одному на строку)</label>
                      <textarea
                        value={draft.soundCloudHttpProxies}
                        onChange={(event) => updateField("soundCloudHttpProxies", event.target.value)}
                        className="h-32 w-full resize-none bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none focus:border-[#8341EF] transition-colors custom-scrollbar"
                        placeholder={"45.141.185.15:5882\n163.5.189.210:3888"}
                        spellCheck={false}
                      />
                    </div>

                    <div className="relative overflow-hidden rounded-2xl pt-4 border-t border-white/5">
                      {!isDesktop && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[1.5px] border border-white/10 rounded-2xl">
                          <span className="flex items-center gap-2 text-xs font-bold text-white/70 bg-black/80 px-4 py-2 rounded-full border border-white/10 shadow-xl">
                            🔒 Доступно только в ПК приложении
                          </span>
                        </div>
                      )}
                      <div className={!isDesktop ? "opacity-30 filter blur-[1px] pointer-events-none select-none" : ""}>
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                          <label className="block text-[11px] font-black uppercase tracking-widest text-white/40">Discord Bot Token</label>
                        </div>
                        <input
                          value={discordBotToken}
                          onChange={(event) => handleDiscordBotTokenChange(event.target.value)}
                          type="password"
                          disabled={!isDesktop}
                          className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none focus:border-[#5865F2] transition-colors"
                          placeholder="Для отображения обложек треков в Discord"
                          spellCheck={false}
                        />
                        <p className="mt-2 text-[10px] text-white/30 leading-relaxed">Нужен для показа обложек треков в Discord Rich Presence. Получите в <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-[#5865F2] hover:underline">Developer Portal</a> → Bot → Reset Token</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </React.Fragment>
);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function Sidebar({ activeTab, setActiveTab, currentUser, profileData, onLoginClick, onLogout, onProfileSave }) {
  const { playHistory, totalListenedSeconds } = useAudioPlayer();
  const [settings, setSettings] = useState(() => getProfileSettings());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hours = Math.floor(totalListenedSeconds / 3600);
  const minutes = Math.floor((totalListenedSeconds % 3600) / 60);
  const timeString = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;

  useEffect(() => subscribeProfileSettings(setSettings), []);

  useEffect(() => {
    let isMounted = true;
    window.amyMusicDesktop?.getAutoLaunch?.()
      .then((enabled) => {
        if (!isMounted) return;
        setSettings((current) => ({ ...current, appLaunchOnStartup: Boolean(enabled) }));
      })
      .catch(() => { });

    window.amyMusicDesktop?.getTrayEnabled?.()
      .then((enabled) => {
        if (!isMounted) return;
        setSettings((current) => ({ ...current, appMinimizeToTray: Boolean(enabled) }));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOpenProfile = () => setIsProfileOpen(true);
    window.addEventListener("amymusic:open-profile", handleOpenProfile);
    return () => window.removeEventListener("amymusic:open-profile", handleOpenProfile);
  }, []);

  const handleProfileSaveEvent = async (data) => {
    if (currentUser && onProfileSave) {
      await onProfileSave(data);
    }
  };

  const proxyCount = settings.soundCloudHttpProxies
    ? settings.soundCloudHttpProxies.split(",").filter(Boolean).length
    : 0;

  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);

  return (
    <aside className={`flex shrink-0 flex-col justify-between py-1 font-medium transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "w-[72px]" : "w-[240px]"}`}>
      <div className="w-full">
        <Logo isCollapsed={isCollapsed} onClick={() => setIsCollapsed(!isCollapsed)} />
        <nav className="mt-6 flex w-full flex-col gap-1">
          {initialNavigation.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              isCollapsed={isCollapsed}
              onClick={() => setActiveTab(item.id)}
            />
          ))}
        </nav>
      </div>

      <div className="mb-4 w-full space-y-2">
        {!isDesktop && (
          <a
            href="/api/download-app"
            target="_blank"
            rel="noopener noreferrer"
            download
            className="group flex w-full items-center gap-3.5 rounded-full py-2 px-[18px] text-left text-xs font-bold text-white transition hover:bg-white/[0.04] overflow-hidden"
            title={isCollapsed ? "Скачать AmyMusic для ПК" : undefined}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8341EF]/20 border border-[#8341EF]/50 text-[#8341EF] group-hover:bg-[#8341EF] group-hover:text-white transition-colors">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
              </svg>
            </div>
            <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
              <span className="flex flex-col whitespace-nowrap">
                <span className="block truncate font-bold text-white">Скачать ПК</span>
                <span className="text-[10px] text-[#8341EF]">Приложение</span>
              </span>
            </span>
          </a>
        )}

        <div className="flex items-center gap-3.5 px-[20px] py-2 text-white/50 overflow-hidden" title={isCollapsed ? `Время: ${timeString}` : undefined}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 opacity-50">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 16 14"></polyline>
            </svg>
          </div>
          <span className={`truncate text-xs font-bold transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
            {timeString} прослушано
          </span>
        </div>

        {currentUser ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("amymusic:open-profile"))}
            className="group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[18px] text-left text-sm transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] text-white/50 hover:text-white/80 overflow-hidden hover:bg-white/[0.04]"
            title={isCollapsed ? (profileData?.displayName || currentUser) : undefined}
          >
            <div className="relative h-9 w-9 shrink-0">
              <img src={profileData?.avatarUrl || "/user.svg"} alt="" className="h-full w-full rounded-full bg-[var(--player-accent)] object-cover opacity-85 transition group-hover:opacity-100 p-1" />
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#181818]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 text-white/50 transition-colors group-hover:text-white">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </div>
            </div>
            <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
              <span className="flex flex-col whitespace-nowrap">
                <span className="block truncate font-bold text-white max-w-[120px]">
                  {profileData?.displayName || currentUser}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#8341EF]">Облако</span>
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onLoginClick}
            className="group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[18px] text-left text-sm transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] text-white/50 hover:text-white/80 overflow-hidden hover:bg-white/[0.04]"
            title={isCollapsed ? "Войти в аккаунт" : undefined}
          >
            <div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-white/5 border border-white/10 group-hover:bg-[#8341EF]/20 group-hover:border-[#8341EF]/50 transition-colors">
              <img src="/user.svg" alt="" className="h-5 w-5 opacity-50 group-hover:opacity-100 group-hover:text-[#8341EF]" style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
            <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
              <span className="font-semibold text-white/70 group-hover:text-white">Войти в аккаунт</span>
            </span>
          </button>
        )}
      </div>

      {isProfileOpen && (
        <ProfileSettingsModal
          settings={settings}
          profileData={profileData}
          onLogout={currentUser ? onLogout : undefined}
          onClose={() => setIsProfileOpen(false)}
          onProfileSave={handleProfileSaveEvent}
          onSave={async (nextSettings) => {
            const savedSettings = saveProfileSettings(nextSettings);
            await Promise.allSettled([
              window.amyMusicDesktop?.setAutoLaunch?.(savedSettings.appLaunchOnStartup),
              window.amyMusicDesktop?.setTrayEnabled?.(savedSettings.appMinimizeToTray)
            ]);
            setSettings(savedSettings);
          }}
        />
      )}
    </aside>
  );
}

function formatFollowers(count) {
  if (!count) return "0 подписчиков";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M подписчиков`;
  if (count >= 1_000) return `${Math.round(count / 100) / 10}K подписчиков`;
  return `${count} подписчиков`;
}

function ArtistCard({ artist, onClick }) {
  const avatarSrc = (artist.avatar && !artist.avatar.includes("logo.png"))
    ? artist.avatar
    : ((artist.cover && !artist.cover.includes("logo.png")) ? artist.cover : "/user.svg");

  return (
    <button
      type="button"
      onClick={() => onClick(artist)}
      className="group flex w-36 shrink-0 flex-col items-center rounded-2xl p-3 text-center transition hover:bg-white/[0.04]"
    >
      <div className="relative h-28 w-28 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] shadow-xl">
        <img
          src={avatarSrc}
          alt={artist.name}
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/user.svg"; }}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/10 opacity-0 transition group-hover:opacity-100" />
      </div>
      <p className="mt-3 w-full truncate text-sm font-black text-white">{artist.username || artist.name}</p>
      <p className="mt-0.5 w-full truncate text-[11px] font-semibold text-white/35">
        {artist.city || formatFollowers(artist.followers)}
      </p>
    </button>
  );
}

function getTrackArtists(track) {
  return track.artists?.length
    ? track.artists
    : [{
      id: track.artistId || "",
      name: track.artist,
      username: track.artist,
      avatar: (track.artistAvatar && !track.artistAvatar.includes("logo.png")) ? track.artistAvatar : ((track.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg"),
      permalinkUrl: track.artistPermalinkUrl || ""
    }];
}

function ArtistLinks({ track, onOpenArtist, className = "text-xs text-white/40" }) {
  const artists = getTrackArtists(track).filter((artist) => artist.name || artist.username);

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-1 overflow-hidden ${className}`}>
      {artists.map((artist, index) => (
        <React.Fragment key={`${artist.id || artist.name}-${index}`}>
          {index > 0 && <span className="text-white/25">,</span>}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenArtist?.({
                id: artist.id || "",
                name: artist.name || artist.username,
                username: artist.username || artist.name,
                avatar: (artist.avatar && !artist.avatar.includes("logo.png")) ? artist.avatar : ((track.artistAvatar && !track.artistAvatar.includes("logo.png")) ? track.artistAvatar : ((track.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg")),
                permalinkUrl: artist.permalinkUrl || "",
                followers: 0,
                followings: 0,
                trackCount: 0,
                city: "",
                country: "",
                tags: []
              });
            }}
            className="max-w-[180px] truncate transition hover:text-white hover:underline"
          >
            {artist.name || artist.username}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function AlbumSearchCard({ album, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(album)}
      className="group w-40 shrink-0 text-left"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <img src={album.cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
        <div className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white/70">
          {album.trackCount || album.tracks?.length || 0}
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-black text-white">{album.title}</p>
      <p className="truncate text-xs font-semibold text-white/35">{album.artist}</p>
    </button>
  );
}

function formatTrackDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function shuffleList(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function SearchAlbumView({
  album,
  isLoading,
  isReleaseSaved,
  onBack,
  onPlayAlbum,
  onShufflePlay,
  onPlayTrack,
  onToggleRelease
}) {
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);
  const tracks = album.tracks || [];

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#090909] text-white shadow-2xl">
      <div className="relative min-h-[300px] overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5">
        <div className="absolute inset-0 opacity-30 blur-3xl">
          <img src={album.cover} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/82 to-[#090909]" />

        {isCoverExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={() => setIsCoverExpanded(false)} />
            <img src={album.cover} alt="" className="relative z-10 max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          </div>
        )}

        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7">
            <img 
              src={album.cover} 
              alt={album.title} 
              onClick={() => setIsCoverExpanded(true)}
              className="h-52 w-52 shrink-0 rounded-3xl border border-white/10 object-cover shadow-2xl cursor-pointer transition hover:scale-105 active:scale-95" 
            />
            <div className="max-w-4xl pb-2">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/35">
                {album.kind === "playlist" ? "Плейлист" : "Альбом"}
              </p>
              <h1 className="text-5xl font-black tracking-tight text-white">{album.title}</h1>
              <p className="mt-2 text-base font-bold text-white/48">{album.artist}</p>
              <p className="mt-3 text-sm font-bold text-white/38">
                {tracks.length || album.trackCount || 0} треков
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPlayAlbum}
                  disabled={!tracks.length}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40"
                >
                  ▶ Слушать все
                </button>
                <button
                  type="button"
                  onClick={() => onToggleRelease?.(album)}
                  className={[
                    "grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] active:scale-95",
                    isReleaseSaved ? "opacity-100" : "opacity-55 hover:opacity-90"
                  ].join(" ")}
                  aria-label={isReleaseSaved ? "Убрать альбом из коллекции" : "Добавить альбом в коллекцию"}
                  title={isReleaseSaved ? "Убрать альбом из коллекции" : "Добавить альбом в коллекцию"}
                >
                  <img src={isReleaseSaved ? "/like.svg" : "/unlike.svg"} alt="" className={`h-5 w-5 ${isReleaseSaved ? "" : "brightness-200"}`} />
                </button>
                <button
                  type="button"
                  onClick={onShufflePlay}
                  disabled={!tracks.length}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-35"
                  aria-label="Перемешать альбом и слушать"
                  title="Перемешать альбом и слушать"
                >
                  <img src="/shuffle.svg" alt="" className="h-5 w-5 brightness-200 opacity-70" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-7">
        {isLoading && <p className="mb-4 text-sm font-bold text-white/35">Догружаю треки...</p>}
        {tracks.length ? (
          <div className="space-y-1">
            {tracks.map((track, index) => (
              <button
                key={track.id || `${album.id}-${index}`}
                type="button"
                onClick={() => onPlayTrack(track, tracks)}
                disabled={!track.id && !track.streamUrl}
                className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.04] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
              >
                <span className="w-7 text-right text-xs font-black text-white/25">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{track.title}</p>
                  <p className="truncate text-xs font-semibold text-white/35">{track.artist}</p>
                </div>
                <span className="text-xs font-semibold text-white/30">{formatTrackDuration(track.duration)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[220px] place-items-center text-center">
            <p className="text-sm font-bold text-white/35">Треки пока не загрузились</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SearchPanel({ onOpenArtist }) {
  const { playHistory, clearHistory, likedTracks, dislikedTrackIds, dislikedTracks, playTrack, savedReleaseIds, toggleSavedRelease } = useAudioPlayer();
  const [query, setQuery] = useState("");
  const [activeSearchTab, setActiveSearchTab] = useState("popular");
  const [tracks, setSearchTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const runSearch = async (nextQuery = query) => {
    const normalizedQuery = nextQuery.trim();
    if (!normalizedQuery) {
      setActiveSearchTab("popular");
      loadPopular();
      return;
    }

    setActiveSearchTab("popular");
    setIsSearching(true);
    setSearchError("");
    try {
      const [results, artistResults, albumResults, playlistResults] = await Promise.all([
        searchTracks(normalizedQuery),
        searchArtists(normalizedQuery),
        searchAlbums(normalizedQuery),
        searchPlaylists(normalizedQuery)
      ]);
      setSearchTracks(results);
      setArtists(artistResults.length ? artistResults : buildArtistsFromTracks(results));
      setAlbums(albumResults);
      setPlaylists(playlistResults);
    } catch (error) {
      setSearchError(error.message || "Не удалось загрузить треки");
    } finally {
      setIsSearching(false);
    }
  };

  const loadPopular = async () => {
    setIsSearching(true);
    setSearchError("");
    try {
      const results = await getRecommendedTracks();
      setSearchTracks(results);
      setArtists(buildArtistsFromTracks(results));
      setAlbums([]);
      setPlaylists([]);
    } catch (error) {
      setSearchError(error.message || "Не удалось загрузить рекомендации");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    loadPopular();
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return undefined;

    let isCurrent = true;
    const timer = setTimeout(async () => {
      setActiveSearchTab("popular");
      setIsSearching(true);
      setSearchError("");
      try {
        const [results, artistResults, albumResults, playlistResults] = await Promise.all([
          searchTracks(normalizedQuery),
          searchArtists(normalizedQuery),
          searchAlbums(normalizedQuery),
          searchPlaylists(normalizedQuery)
        ]);
        if (!isCurrent) return;
        setSearchTracks(results);
        setArtists(artistResults.length ? artistResults : buildArtistsFromTracks(results));
        setAlbums(albumResults);
        setPlaylists(playlistResults);
      } catch (error) {
        if (isCurrent) {
          setSearchError(error.message || "Не удалось загрузить треки");
        }
      } finally {
        if (isCurrent) {
          setIsSearching(false);
        }
      }
    }, 420);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSearch = async (event) => {
    event.preventDefault();
    runSearch();
  };

  const openArtist = async (artist) => {
    onOpenArtist?.(artist);
  };

  const openAlbum = async (album) => {
    setActiveAlbum(album);
    setIsAlbumLoading(true);
    try {
      const fullAlbum = await getAlbumDetails(album, {
        username: album.artist,
        name: album.artist,
        avatar: album.cover
      });
      setActiveAlbum(fullAlbum);
    } finally {
      setIsAlbumLoading(false);
    }
  };

  const loadArtistsTab = async () => {
    setActiveSearchTab("artists");
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setIsSearching(true);
    setSearchError("");
    try {
      const artistResults = await searchArtists(normalizedQuery);
      setArtists(artistResults.length ? artistResults : buildArtistsFromTracks(tracks));
    } catch (error) {
      setSearchError(error.message || "Не удалось загрузить артистов");
    } finally {
      setIsSearching(false);
    }
  };

  const loadAlbumsTab = async () => {
    setActiveSearchTab("albums");
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setIsSearching(true);
    setSearchError("");
    try {
      setAlbums(await searchAlbums(normalizedQuery));
    } catch (error) {
      setSearchError(error.message || "Не удалось загрузить альбомы");
    } finally {
      setIsSearching(false);
    }
  };

  const loadPlaylistsTab = async () => {
    setActiveSearchTab("playlists");
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setIsSearching(true);
    setSearchError("");
    try {
      setPlaylists(await searchPlaylists(normalizedQuery));
    } catch (error) {
      setSearchError(error.message || "Не удалось загрузить плейлисты");
    } finally {
      setIsSearching(false);
    }
  };

  const visibleTracks = activeSearchTab === "history" ? playHistory : tracks;
  const trackSource = activeSearchTab === "history" ? playHistory : tracks;

  if (activeAlbum) {
    return (
      <SearchAlbumView
        album={activeAlbum}
        isLoading={isAlbumLoading}
        isReleaseSaved={savedReleaseIds.has(activeAlbum.id)}
        onBack={() => setActiveAlbum(null)}
        onPlayAlbum={() => {
          const playableTracks = activeAlbum.tracks?.filter((track) => track.streamUrl) || [];
          if (playableTracks[0]) playTrack(playableTracks[0], playableTracks);
        }}
        onShufflePlay={() => {
          const playableTracks = activeAlbum.tracks?.filter((track) => track.streamUrl) || [];
          const shuffledTracks = shuffleList(playableTracks);
          if (shuffledTracks[0]) playTrack(shuffledTracks[0], shuffledTracks);
        }}
        onPlayTrack={(track, albumTracks) => {
          const playableTracks = albumTracks.filter((item) => item.streamUrl);
          playTrack(track, playableTracks.length ? playableTracks : [track]);
        }}
        onToggleRelease={toggleSavedRelease}
      />
    );
  }

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#121212] p-[26.6px] shadow-2xl">
      <form
        onSubmit={handleSearch}
        className="flex h-[44.4px] w-full items-center gap-3 rounded-full border border-[#4D4D4D] bg-white/[0.002] px-4 text-[#808080] transition focus-within:border-white/40"
      >
        <img src="/search-input.svg" alt="" className="h-5 w-5" />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (!nextQuery.trim()) {
              setActiveSearchTab("popular");
              loadPopular();
            }
          }}
          placeholder="Что вы чувствуете или ищете?"
          className="w-full bg-transparent text-[15.5px] text-[#E6E6E6] placeholder:text-[#808080] focus:outline-none"
        />
        <button type="submit" className="text-xs font-bold text-white/60 hover:text-white">
          {isSearching ? "..." : "Enter"}
        </button>
      </form>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveSearchTab("popular");
            if (!tracks.length) loadPopular();
          }}
          className={[
            "rounded-full px-4 py-2 text-[15.5px] font-bold transition",
            activeSearchTab === "popular"
              ? "bg-white/10 text-[#E6E6E6]"
              : "text-[#E6E6E6] opacity-60 hover:opacity-100"
          ].join(" ")}
        >
          Популярное
        </button>
        <button
          type="button"
          onClick={() => setActiveSearchTab("history")}
          className={[
            "rounded-full px-4 py-2 text-[15.5px] font-bold transition",
            activeSearchTab === "history"
              ? "bg-white/10 text-[#E6E6E6]"
              : "text-[#E6E6E6] opacity-60 hover:opacity-100"
          ].join(" ")}
        >
          История
        </button>
        <button
          type="button"
          onClick={loadArtistsTab}
          className={[
            "rounded-full px-4 py-2 text-[15.5px] font-bold transition",
            activeSearchTab === "artists"
              ? "bg-white/10 text-[#E6E6E6]"
              : "text-[#E6E6E6] opacity-60 hover:opacity-100"
          ].join(" ")}
        >
          Артисты
        </button>
        <button
          type="button"
          onClick={loadAlbumsTab}
          className={[
            "rounded-full px-4 py-2 text-[15.5px] font-bold transition",
            activeSearchTab === "albums"
              ? "bg-white/10 text-[#E6E6E6]"
              : "text-[#E6E6E6] opacity-60 hover:opacity-100"
          ].join(" ")}
        >
          Альбомы
        </button>
        <button
          type="button"
          onClick={loadPlaylistsTab}
          className={[
            "rounded-full px-4 py-2 text-[15.5px] font-bold transition",
            activeSearchTab === "playlists"
              ? "bg-white/10 text-[#E6E6E6]"
              : "text-[#E6E6E6] opacity-60 hover:opacity-100"
          ].join(" ")}
        >
          Плейлисты
        </button>
      </div>

      {searchError && (
        <p className="mt-5 text-sm text-red-300">{searchError}</p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-black text-white">
            {isSearching
              ? "Загружаю..."
              : activeSearchTab === "history"
                ? "История"
                : activeSearchTab === "artists"
                  ? "Артисты"
                  : activeSearchTab === "albums"
                    ? "Альбомы"
                    : activeSearchTab === "playlists"
                      ? "Плейлисты"
                      : "Рекомендации"}
          </h2>
          {activeSearchTab === "history" && playHistory.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="flex items-center gap-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3.5 py-1.5 text-xs font-bold text-red-400 hover:text-red-300 transition shadow-sm active:scale-95"
              title="Очистить историю прослушиваний"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Очистить историю
            </button>
          )}
        </div>
        <span className="text-xs font-semibold text-white/30">
          {activeSearchTab === "artists"
            ? artists.length ? `${artists.length} артистов` : "нет данных"
            : activeSearchTab === "albums"
              ? albums.length ? `${albums.length} релизов` : "нет данных"
              : activeSearchTab === "playlists"
                ? playlists.length ? `${playlists.length} плейлистов` : "нет данных"
                : visibleTracks.length ? `${visibleTracks.length} треков` : "нет данных"}
        </span>
      </div>

      {activeSearchTab === "history" && visibleTracks.length === 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-white/70">История пока пустая</p>
          <p className="mt-1 text-xs text-white/35">Включи трек из поиска или Моей волны.</p>
        </div>
      )}

      {activeSearchTab === "artists" && (
        artists.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            {artists.map((artist) => (
              <ArtistCard key={artist.id || artist.username} artist={artist} onClick={openArtist} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-sm font-semibold text-white/70">Артисты не найдены</p>
          </div>
        )
      )}

      {activeSearchTab === "albums" && (
        albums.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-4">
            {albums.map((album) => (
              <AlbumSearchCard key={album.id} album={album} onClick={openAlbum} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-sm font-semibold text-white/70">Альбомы не найдены</p>
          </div>
        )
      )}

      {activeSearchTab === "playlists" && (
        playlists.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-4">
            {playlists.map((playlist) => (
              <AlbumSearchCard key={playlist.id} album={playlist} onClick={openAlbum} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-sm font-semibold text-white/70">Плейлисты не найдены</p>
          </div>
        )
      )}

      {activeSearchTab !== "artists" && activeSearchTab !== "albums" && activeSearchTab !== "playlists" && (() => {
        const leftTracks = [];
        const rightTracks = [];
        visibleTracks.forEach((track, index) => {
          const chunkIndex = Math.floor(index / 5);
          if (chunkIndex % 2 === 0) {
            leftTracks.push(track);
          } else {
            rightTracks.push(track);
          }
        });

        const renderTrackItem = (track) => (
          <div
            key={track.id}
            className="group flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/5"
          >
            <button
              type="button"
              onClick={() => playTrack(track, trackSource)}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-left"
            >
              <img
                src={track.cover}
                alt=""
                className="h-11 w-11 rounded-lg object-cover"
              />
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => playTrack(track, trackSource)}
                className="block max-w-full truncate text-left text-sm font-semibold text-white transition hover:text-white/80"
              >
                {track.title}
              </button>
              <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
            </div>
            <div className="relative w-10 h-10 flex items-center justify-end shrink-0 select-none">
              <span className="text-xs font-semibold text-white/30 group-hover:opacity-0 transition-opacity duration-150 pr-2">
                {formatDuration(track.duration)}
              </span>
              <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <TrackMenuButton
                  track={track}
                  onOpenArtist={onOpenArtist}
                  onOpenAlbum={openAlbum}
                />
              </div>
            </div>
          </div>
        );

        return (
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              {leftTracks.map(renderTrackItem)}
            </div>
            <div className="flex flex-col gap-2">
              {rightTracks.map(renderTrackItem)}
            </div>
          </div>
        );
      })()}
    </section>
  );
}

function TrendsPanel({ onOpenArtist, onOpenAlbum }) {
  const {
    currentTrack,
    likedTracks,
    dislikedTrackIds,
    dislikedTracks,
    playHistory,
    playTrack
  } = useAudioPlayer();
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTrends() {
      setIsLoading(true);
      setError("");
      try {
        let results = [];
        let loadedFromChart = false;

        if (window.amyMusicDesktop?.getBandlinkChart) {
          try {
            const chartData = await window.amyMusicDesktop.getBandlinkChart();
            if (chartData && chartData.length > 0) {
              const searchPromises = chartData.map(async (item) => {
                try {
                  const query = `${item.artist} ${item.title}`.trim();
                  const matched = await searchTracks(query);
                  return matched && matched.length > 0 ? matched[0] : null;
                } catch (err) {
                  return null;
                }
              });
              const scTracks = await Promise.all(searchPromises);
              results = scTracks.filter(Boolean);
              if (results.length > 20) {
                results = results.slice(0, 20);
              }
              if (results.length > 0) {
                loadedFromChart = true;
              }
            }
          } catch (chartErr) {
            console.warn("Failed to load Bandlink chart, falling back to recommendations", chartErr);
          }
        }

        if (!loadedFromChart) {
          results = await getPersonalWaveTracks({
            likedTracks,
            dislikedTrackIds,
            dislikedTracks,
            playHistory,
            currentTrack
          });

          if (!results.length) {
            results = await getRecommendedTracks();
          }
        }

        if (isMounted) setTracks(results);
      } catch (loadError) {
        if (isMounted) setError(loadError.message || "Не удалось загрузить тренды");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadTrends();

    return () => {
      isMounted = false;
    };
  }, [currentTrack, dislikedTrackIds, likedTracks, playHistory]);

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#121212] p-[26.6px] shadow-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Тренды и Чарты</h2>
          <p className="mt-1 text-sm font-semibold text-white/35">Самые популярные треки на основе реальных чартов.</p>
        </div>
        <span className="text-xs font-semibold text-white/30">
          {isLoading ? "загрузка" : `${tracks.length} треков`}
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {(() => {
        const renderTrackItem = (track, index) => (
          <div
            key={track.id || index}
            className="group flex items-center gap-4 rounded-xl p-3 text-left transition hover:bg-white/5"
          >
            <div className="w-6 text-center text-sm font-bold text-white/40 group-hover:text-white/80">
              {index + 1}
            </div>
            <button type="button" onClick={() => playTrack(track, tracks)} className="h-12 w-12 shrink-0">
              <img src={track.cover} alt="" className="h-12 w-12 rounded-lg object-cover shadow-md" />
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => playTrack(track, tracks)}
                className="block max-w-full truncate text-left text-[15px] font-bold text-white transition hover:text-white/80"
              >
                {track.title}
              </button>
              <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
            </div>
            <div className="relative w-10 h-10 flex items-center justify-end shrink-0 select-none">
              <span className="text-xs font-semibold text-white/30 group-hover:opacity-0 transition-opacity duration-150 pr-2">
                {formatDuration(track.duration)}
              </span>
              <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <TrackMenuButton
                  track={track}
                  onOpenArtist={onOpenArtist}
                  onOpenAlbum={onOpenAlbum}
                />
              </div>
            </div>
          </div>
        );

        return (
          <div className="flex flex-col gap-1 max-w-4xl">
            {tracks.map((track, index) => renderTrackItem(track, index))}
          </div>
        );
      })()}
    </section>
  );
}

function TrackInfo({ onOpenFull, onOpenArtist, onOpenAlbum }) {
  const { currentTrack } = useAudioPlayer();

  return (
    <div onClick={onOpenFull} className="group flex w-[300px] cursor-pointer items-center gap-3">
      <div className="relative shrink-0 overflow-hidden rounded-[6.66px]">
        <img
          src={currentTrack.cover}
          alt={currentTrack.title}
          className="h-[50px] w-[50px] object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
          </svg>
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15.5px] font-medium text-white group-hover:underline">
            {currentTrack.title}
          </p>
          <span className="rounded bg-white/10 px-1 text-[10px] text-white/50">67+</span>
          <div className="relative">
            <TrackMenuButton
              track={currentTrack}
              onOpenArtist={onOpenArtist}
              onOpenAlbum={onOpenAlbum}
              placement="top"
            />
          </div>
        </div>
        <ArtistLinks
          track={currentTrack}
          onOpenArtist={onOpenArtist}
          className="text-[15.5px] text-white/50"
        />
      </div>
    </div>
  );
}

function PlayerIconButton({ id, icon, label, onClick, active = false, badge = "" }) {
  const renderIcon = () => {
    if (id === "dislike") {
      return (
        <svg 
          style={{ fill: active ? "var(--player-accent, #8341EF)" : "currentColor" }}
          className={`h-5 w-5 transition-colors ${active ? "" : "text-white/60 hover:text-white"}`} 
          viewBox="0 0 24 22"
        >
          <path fillRule="evenodd" clipRule="evenodd" d="M17.8212 16.7055L21.081 19.4508L22.5105 17.7534L1.42948 0L0 1.69743L2.46855 3.77631C1.70961 4.89297 1.26953 6.33731 1.26953 8.06101C1.26953 11.9861 4.22921 14.5651 6.67973 16.5225C6.94981 16.7383 7.21387 16.9463 7.47062 17.1487C8.44852 17.9193 9.3203 18.6061 10.0123 19.3128C10.8831 20.2018 11.2558 20.9169 11.2558 21.5858H13.475C13.475 20.9169 13.8477 20.2018 14.7184 19.3128C15.4105 18.6061 16.2821 17.9192 17.26 17.1487C17.4435 17.0041 17.6308 16.8566 17.8212 16.7055ZM16.0882 15.2461L4.1805 5.21803C3.7654 5.91242 3.48871 6.84633 3.48871 8.06101C3.48871 10.7933 5.52215 12.7576 8.06476 14.7886C8.30011 14.9766 8.54083 15.1661 8.78332 15.357C9.77472 16.1373 10.7953 16.9407 11.5977 17.7599C11.8676 18.0356 12.1284 18.3278 12.3653 18.6383C12.6023 18.3278 12.8631 18.0356 13.133 17.7599C13.9355 16.9407 14.956 16.1373 15.9475 15.357C15.9944 15.32 16.0414 15.283 16.0882 15.2461ZM17.3352 1.23124C15.509 1.26961 13.7485 2.14104 12.5963 3.74083L14.3034 5.17015C15.0718 4.01573 16.262 3.47345 17.3818 3.44992C18.3427 3.42972 19.2908 3.78206 20.0004 4.5031C20.7027 5.21665 21.2421 6.36524 21.2421 8.06101C21.2421 8.9416 21.0308 9.7424 20.6594 10.4914L22.3964 11.9456C23.0454 10.8145 23.4612 9.53222 23.4612 8.06101C23.4612 5.87314 22.7522 4.13532 21.5821 2.94644C20.4193 1.76506 18.8709 1.19897 17.3352 1.23124Z" />
        </svg>
      );
    }
    return <img src={icon} alt={label} className="h-5 w-5 brightness-200" />;
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        "relative grid h-9 w-9 place-items-center rounded-full transition active:scale-95",
        active
          ? "bg-[var(--player-accent-soft)] opacity-100"
          : "opacity-60 hover:bg-white/10 hover:opacity-100"
      ].join(" ")}
    >
      {renderIcon()}
      {badge && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--player-accent)] px-1 text-[9px] font-black leading-none text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function PlayerControls() {
  const { controls, isPlaying, isLoading, trackPalette } = useAudioPlayer();

  return (
    <div className="flex items-center justify-center gap-4">
      {controls.map((control) =>
        control.primary ? (
          <button
            key={control.id}
            type="button"
            onClick={control.action}
            aria-label={control.label}
            title={isLoading ? "Прогружаю трек..." : control.label}
            className="grid shrink-0 place-items-center transition hover:scale-105 active:scale-95"
          >
            {isLoading ? (
              <span
                className="grid h-[44.39px] w-[44.39px] place-items-center rounded-full text-white animate-spin"
                style={{ backgroundColor: "var(--player-accent)" }}
              >
                <svg className="h-5 w-5 fill-current opacity-80" viewBox="0 0 24 24">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                </svg>
              </span>
            ) : isPlaying ? (
              <span
                className="grid h-[44.39px] w-[44.39px] place-items-center rounded-full text-white"
                style={{ backgroundColor: "var(--player-accent)" }}
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </span>
            ) : (
              <img src={control.icon} alt="" className="h-[44.39px] w-[44.39px]" />
            )}
          </button>
        ) : (
          <PlayerIconButton
            key={control.id}
            id={control.id}
            icon={control.icon}
            label={control.label}
            onClick={control.action}
            active={control.active}
            badge={control.badge}
          />
        )
      )}
    </div>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function PlayerSeekBar() {
  const { currentTime, duration, progress, seek } = useAudioPlayer();
  const percent = Math.round((progress || 0) * 1000) / 10;

  return (
    <div className="mt-2 flex items-center gap-3 px-1">
      <span className="w-10 text-right text-[10px] font-medium text-white/35">
        {formatTime(currentTime)}
      </span>
      <div className="player-seek-wrap relative h-4 flex-1">
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[var(--player-accent-muted)]" style={{ width: `${percent}%` }} />
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(duration || 0, 1)}
          step="0.1"
          value={Math.min(currentTime || 0, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!duration}
          aria-label="Перемотка трека"
          className="player-seek-slider"
        />
      </div>
      <span className="w-10 text-[10px] font-medium text-white/35">
        {formatTime(duration)}
      </span>
    </div>
  );
}
function PlayerTools({ onOpenFull }) {
  const { currentTrack, effectiveVolume, playTrack, queue, reorderQueue, setVolume, isEqualizerOpen, setIsEqualizerOpen } = useAudioPlayer();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);
  const volumePercent = Math.round(effectiveVolume * 100);

  useEscapeKey(isQueueOpen, () => {
    setIsQueueOpen(false);
  });

  const profileSettings = getProfileSettings();

  return (
    <div className="flex w-auto items-center justify-end gap-2">
      <PlayerIconButton icon="/lyrics.svg" label="Текст песни" onClick={onOpenFull} />
      <div className="relative">
        <PlayerIconButton
          icon="/queue.svg"
          label="Очередь"
          onClick={() => setIsQueueOpen((value) => !value)}
          active={isQueueOpen}
        />
        {isQueueOpen && (
          <div className="absolute bottom-11 right-0 z-40 w-80 rounded-2xl border border-white/10 bg-[#171717]/95 p-3 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-white/80">Очередь</p>
              <span className="text-[10px] font-semibold text-white/35">{queue.length} треков</span>
            </div>
            <div
              onWheel={(e) => {
                if (draggedQueueIndex !== null) {
                  e.currentTarget.scrollTop += e.deltaY;
                }
              }}
              onDragOver={(e) => {
                if (draggedQueueIndex === null) return;
                e.preventDefault();
                const container = e.currentTarget;
                const rect = container.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                if (offsetY < 40) {
                  container.scrollTop -= 10;
                } else if (rect.height - offsetY < 40) {
                  container.scrollTop += 10;
                }
              }}
              className="max-h-72 space-y-1 overflow-y-auto pr-1"
            >
              {queue.length === 0 ? (
                <p className="py-5 text-center text-xs text-white/35">Очередь пустая</p>
              ) : (
                queue.map((track, index) => {
                  const isCurrent = currentTrack.id === track.id;
                  const isDragging = draggedQueueIndex === index;
                  const isDragOver = dragOverQueueIndex === index;

                  return (
                    <div
                      key={`${track.id}-${index}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(index));
                        setDraggedQueueIndex(index);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverQueueIndex(index);
                      }}
                      onDragLeave={() => setDragOverQueueIndex(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromIdx = draggedQueueIndex;
                        setDraggedQueueIndex(null);
                        setDragOverQueueIndex(null);
                        if (fromIdx !== null && fromIdx !== index) {
                          reorderQueue(fromIdx, index);
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedQueueIndex(null);
                        setDragOverQueueIndex(null);
                      }}
                      className={`group flex items-center justify-between rounded-xl p-2 transition cursor-grab active:cursor-grabbing ${
                        isCurrent
                          ? "bg-white/10"
                          : isDragOver
                            ? "bg-[#8341EF]/20 border border-[#8341EF]/50"
                            : "hover:bg-white/5"
                      } ${isDragging ? "opacity-30 scale-95" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => playTrack(track, queue)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <img src={track.cover} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm" />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-xs font-bold ${isCurrent ? "text-[#8341EF]" : "text-white"}`}>
                            {track.title}
                          </p>
                          <p className="truncate text-[10px] font-semibold text-white/40">{track.artist}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <TrackMenuButton track={track} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      <PlayerIconButton
        icon="/equalizer.svg"
        label="10-Полосный Эквалайзер"
        onClick={() => setIsEqualizerOpen((val) => !val)}
        active={isEqualizerOpen}
      />
      <div className="volume-control group relative grid h-9 w-9 place-items-center">
        <div className="volume-popover pointer-events-none absolute bottom-10 left-1/2 z-30 flex h-[238px] w-12 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/10 bg-[#171717]/95 py-3 opacity-0 shadow-2xl backdrop-blur-md transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <div
            className="volume-live-fill pointer-events-none absolute left-1/2 w-[9px] -translate-x-1/2 rounded-full bg-[var(--player-accent-muted)]"
            style={{
              height: `${Math.max(12, effectiveVolume * 221)}px`,
              bottom: "8px"
            }}
          />
          <div
            className="volume-live-thumb pointer-events-none absolute left-1/2 h-[19px] w-[19px] -translate-x-1/2 rounded-full bg-[var(--player-accent)]"
            style={{
              bottom: `${8 + effectiveVolume * (221 - 19)}px`
            }}
          />
          <img
            src="/volume-input.svg"
            alt=""
            className="pointer-events-none absolute h-[221px] w-[19px] select-none opacity-70"
          />
          <input
            type="range"
            min="0"
            max="100"
            value={volumePercent}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
            aria-label="Громкость"
            className="volume-slider"
          />
        </div>
        <button type="button" aria-label="Громкость" className="grid h-9 w-9 place-items-center rounded-full opacity-60 transition hover:bg-white/10 hover:opacity-100 active:scale-95 group-focus-within:bg-white/10 group-focus-within:opacity-100">
          <img src={effectiveVolume > 0 ? "/volume-plus.svg" : "/volume-mute.svg"} alt="Громкость" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function AlbumViewContainer({ album, onBack, onOpenArtist, onOpenAlbum }) {
  const {
    likedTrackIds,
    savedReleaseIds,
    playTrack,
    toggleLike,
    toggleSavedRelease
  } = useAudioPlayer();

  const [fullAlbum, setFullAlbum] = useState(album);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setFullAlbum(album);

    if (!album?.tracks || album.tracks.length === 0) {
      setIsLoading(true);
      getAlbumDetails(album, { id: album?.artistId, username: album?.artist, name: album?.artist })
        .then((fetched) => {
          if (isMounted && fetched) setFullAlbum(fetched);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }

    return () => { isMounted = false; };
  }, [album]);

  const tracks = fullAlbum?.tracks || [];
  const isSaved = savedReleaseIds.has(fullAlbum?.id);

  const handlePlayAlbum = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  return (
    <AlbumView
      album={fullAlbum}
      artist={{ username: fullAlbum?.artist, name: fullAlbum?.artist }}
      isLoading={isLoading}
      likedTrackIds={likedTrackIds}
      isReleaseSaved={isSaved}
      onBack={onBack}
      onPlayAlbum={handlePlayAlbum}
      onShufflePlay={handleShufflePlay}
      onPlayTrack={(track, queue) => playTrack(track, queue)}
      onToggleLike={(trackId, track) => toggleLike(trackId, track)}
      onToggleRelease={() => toggleSavedRelease(fullAlbum)}
      onOpenArtist={onOpenArtist}
      onOpenAlbum={onOpenAlbum}
    />
  );
}

function BottomPlayer({ onOpenFull, onOpenArtist, onOpenAlbum }) {
  const { trackPalette } = useAudioPlayer();

  return (
    <div
      className="w-full rounded-[13.32px] border border-white/[0.04] px-4 py-3 shadow-2xl"
      style={{
        "--player-accent": `color-mix(in srgb, ${trackPalette.line} 58%, #3a3a3a)`,
        "--player-accent-muted": `color-mix(in srgb, ${trackPalette.line} 42%, #8a8a8a)`,
        "--player-accent-soft": `color-mix(in srgb, ${trackPalette.line} 18%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${trackPalette.shadow} 52%, #161616)`,
        boxShadow: "0 22px 60px rgba(0,0,0,.48)"
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <TrackInfo onOpenFull={onOpenFull} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} />
        <PlayerControls />
        <PlayerTools onOpenFull={onOpenFull} />
      </div>
      <PlayerSeekBar />
    </div>
  );
}

export default function App() {
  const { isFullOpen, setIsFullOpen, isEqualizerOpen, setIsEqualizerOpen, mergeServerData, likedTracks, dislikedTrackIds, playHistory } = useAudioPlayer();
  const [activeTab, setActiveTab] = useState("wave");
  const [previousTab, setPreviousTab] = useState("wave");
  const [activeArtist, setActiveArtist] = useState(null);
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [waveRequestId, setWaveRequestId] = useState(0);
  const [apiSettingsVersion, setApiSettingsVersion] = useState(0);

  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState(getUsername() || null);
  const [profileData, setProfileData] = useState({ displayName: "", avatarUrl: "" });
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLoginSuccess = async ({ username, displayName, avatarUrl }) => {
    setCurrentUser(username);
    if (displayName !== undefined) {
      setProfileData({ displayName: displayName || "", avatarUrl: avatarUrl || "" });
    }
    setShowAuthModal(false);
    
    // Migration logic
    try {
      let needsSync = false;
      
      if (likedTracks?.length > 0 || dislikedTrackIds?.size > 0 || playHistory?.length > 0) {
        if (likedTracks?.length > 0) {
          await syncCollections({ likedTracks });
          needsSync = true;
        }
        
        let waveData = {};
        if (dislikedTrackIds?.size > 0) waveData.dislikedTrackIds = Array.from(dislikedTrackIds);
        if (playHistory?.length > 0) waveData.playHistory = playHistory;
        
        if (Object.keys(waveData).length > 0) {
          await syncWave(waveData);
          needsSync = true;
        }
      }
      
      await loadDataFromServer();
    } catch (err) {
      console.error("Migration failed:", err);
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    setCurrentUser(null);
    setProfileData({ displayName: "", avatarUrl: "" });
  };

  const handleProfileSave = async (data) => {
    try {
      const res = await updateProfile(data);
      if (res.success) {
        setProfileData({ displayName: res.displayName, avatarUrl: res.avatarUrl });
      }
    } catch (e) {
      console.error("Failed to update profile", e);
    }
  };

  const loadDataFromServer = async () => {
    try {
      if (getUsername()) {
        const profile = await getProfile().catch(() => null);
        if (profile) {
          setProfileData({ displayName: profile.displayName || "", avatarUrl: profile.avatarUrl || "" });
        }

        const collections = await getCollections();
        const wave = await getWave();

        if (mergeServerData) {
          mergeServerData({
            likedTracks: collections.likedTracks,
            dislikedTrackIds: wave.dislikedTrackIds,
            playHistory: wave.playHistory,
            totalListenedSeconds: profile?.totalListenedSeconds
          });
        }

        
        // Force reload by changing app settings version
        setApiSettingsVersion((version) => version + 1);
      }
    } catch(e) {
      console.error("Failed to load server data", e);
    }
  };

  useEffect(() => {
    loadDataFromServer();
  }, []);

  useEffect(
    () => subscribeProfileSettings(() => {
      setApiSettingsVersion((version) => version + 1);
      setWaveRequestId((id) => id + 1);
    }),
    []
  );

  const selectTab = (tabId) => {
    if (tabId === "wave") {
      setWaveRequestId((id) => id + 1);
    }
    setActiveTab(tabId);
  };

  const openArtist = (artist) => {
    setPreviousTab((prev) => (prev === "artist" || prev === "album" ? prev : activeTab));
    setActiveArtist(artist);
    setActiveTab("artist");
  };

  const closeArtist = () => {
    setActiveArtist(null);
    setActiveTab(previousTab || "wave");
  };

  const openAlbum = (album) => {
    setIsFullOpen(false);
    setPreviousTab((prev) => (prev === "album" || prev === "artist" ? prev : activeTab));
    setActiveAlbum(album);
    setActiveTab("album");
  };

  const closeAlbum = () => {
    setActiveAlbum(null);
    setActiveTab(previousTab || "wave");
  };

  const renderAuthRequired = (title, message) => (
    <div className="flex h-full flex-col items-center justify-center rounded-[17.76px] border border-white/[0.04] bg-[#121212] p-10 text-center shadow-2xl">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#8341EF]/20 to-transparent border border-[#8341EF]/30">
        <img src="/logo.png" alt="" className="h-12 w-12 object-cover opacity-50 grayscale" />
      </div>
      <h2 className="text-2xl font-black text-white mb-3">{title}</h2>
      <p className="text-sm font-semibold text-white/40 max-w-sm mb-8">{message}</p>
      <button
        onClick={() => setShowAuthModal(true)}
        className="rounded-full bg-[#8341EF] px-8 py-3.5 text-sm font-bold text-white transition-transform hover:scale-105"
      >
        Войти в аккаунт
      </button>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "wave": 
        return currentUser ? <WaveView requestId={waveRequestId} onOpenFull={() => setIsFullOpen(true)} onOpenSetup={() => setShowMyWaveSetup(true)} /> : renderAuthRequired("Моя волна недоступна", "Авторизуйтесь, чтобы слушать вашу персональную музыкальную волну и сохранять историю.");
      case "collection": 
        return currentUser ? <CollectionView onOpenArtist={openArtist} onOpenAlbum={openAlbum} /> : renderAuthRequired("Коллекция недоступна", "Войдите в свой аккаунт, чтобы сохранять любимые треки в облако и слушать их на любом устройстве.");
      case "trends": return <TrendsPanel onOpenArtist={openArtist} onOpenAlbum={openAlbum} />;
      case "artist":
        return activeArtist ? (
          <ArtistView
            artist={activeArtist}
            onBack={closeArtist}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
          />
        ) : (
          <SearchPanel onOpenArtist={openArtist} onOpenAlbum={openAlbum} />
        );
      case "album":
        return activeAlbum ? (
          <AlbumViewContainer
            album={activeAlbum}
            onBack={closeAlbum}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
          />
        ) : (
          <SearchPanel onOpenArtist={openArtist} onOpenAlbum={openAlbum} />
        );
      case "search": default: return <SearchPanel onOpenArtist={openArtist} onOpenAlbum={openAlbum} />;
    }
  };

  return (
    <main className="relative flex h-screen w-screen select-none gap-4 overflow-hidden bg-black p-3 pt-[36px] text-white">
      {/* Draggable Title Bar Overlay */}
      <div 
        className="absolute left-0 right-0 top-0 h-[36px] bg-transparent" 
        style={{ WebkitAppRegion: "drag" }}
      />
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={selectTab}
        currentUser={currentUser}
        profileData={profileData}
        onLoginClick={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onProfileSave={handleProfileSave}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div key={`${activeTab}-${activeArtist?.id || "none"}-${activeAlbum?.id || "noalbum"}-${apiSettingsVersion}`} className="contents">
          {renderContent()}
        </div>
        {activeTab !== "wave" && (
          <div className="flex shrink-0 flex-col gap-1">
            <BottomPlayer onOpenFull={() => setIsFullOpen(true)} onOpenArtist={openArtist} onOpenAlbum={openAlbum} />
            <p className="self-end pr-1 text-[10px] text-neutral-600">Copyright © 2026 AmyMusic. Все права НЕ защищены.</p>
          </div>
        )}
      </div>
      {isFullOpen && (
        <FullPlayerOverlay
          onClose={() => setIsFullOpen(false)}
          onOpenArtist={openArtist}
          onOpenAlbum={openAlbum}
        />
      )}
      {isEqualizerOpen && (
        <EqualizerModal onClose={() => setIsEqualizerOpen(false)} />
      )}
      {showAuthModal && (
        <AuthModal 
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      {showMyWaveSetup && (
        <MyWaveSetupModal
          isOpen={showMyWaveSetup}
          onClose={() => setShowMyWaveSetup(false)}
          onComplete={(payload) => {
            console.log("MyWave setup completed:", payload);
          }}
        />
      )}
    </main>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AmyMusic:renderer]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
          <section className="max-w-2xl rounded-2xl border border-white/10 bg-[#101012] p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-purple-300">AmyMusic crash</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight">Ошибка интерфейса</h1>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/60 p-4 text-xs text-neutral-300">
              {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
            </pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("[AmyMusic:window-error]", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[AmyMusic:unhandled-rejection]", event.reason);
});

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <AudioProvider>
      <App />
    </AudioProvider>
  </AppErrorBoundary>
);

