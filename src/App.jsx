import { initDesktopApi } from "./desktopApi.js";
initDesktopApi();
import { useHorizontalScroll } from "./utils/useHorizontalScroll";

const BLANK_DRAG_IMAGE = typeof window !== "undefined" ? (() => {
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return img;
})() : null;

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Component } from "react";
import { WaveView } from "./components/WaveView";
import HomeView from "./components/HomeView";
import { CollectionView } from "./components/CollectionView";
import { ArtistView, AlbumView } from "./components/ArtistView";
import { FullPlayerOverlay } from "./components/FullPlayerOverlay";
import { AudioProvider, useAudioPlayer } from "./audio/AudioPlayerContext";
import { TrackMenuButton, TrackContextMenu } from "./components/TrackContextMenu";
import { AvatarCropperModal } from "./components/AvatarCropperModal";
import { EqualizerModal } from "./components/EqualizerModal";
import { SettingsView } from "./components/SettingsView";
import { updateProfile } from "./api";
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
  getYandexChartTop100,
  fetchYandexArtistAvatar,
  getYandexCachedArtistAvatar
} from "./services/yandexMusicApi";
import {
  getProfileSettings,
  saveProfileSettings,
  subscribeProfileSettings
} from "./services/profileSettings";
import {
  ensureLocalProfile,
  saveLocalProfile,
  subscribeLocalProfile
} from "./services/localProfile";
import { initNativeShell } from "./native/capacitor";
import { getCachedLyricsForTrack, getActiveLyricIndex } from "./services/lyricsApi";
import { useEscapeKey } from "./utils/useEscapeKey";
import { MobileLayout } from "./mobile/MobileLayout";
import { getPinnedPlaylists } from "./components/CollectionView";
import "./main.css";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
}

const initialNavigation = [
  { id: "search", label: "Поиск", icon: "/search.svg" },
  { id: "wave", label: "Моя волна", icon: "/wave.svg" },
  { id: "trends", label: "Чарты", icon: "/trends.svg" },
  { id: "collection", label: "Коллекция", icon: "/collection.svg" }
];

function SidebarItem({ item, isActive, isCollapsed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[26px] text-sm transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] overflow-hidden",
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
      <span className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
        <span className="text-[14.9px] whitespace-nowrap">{item.label}</span>
      </span>
    </button>
  );
}

function ProfileSettingsModal({ settings, profileData, onClose, onSave, onProfileSave }) {
  const { setIsEqualizerOpen, isAudioCacheEnabled, toggleAudioCache, clearAudioCache, audioCacheSize } = useAudioPlayer();
  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);
  const [draft, setDraft] = useState(settings);
  const [draftProfile, setDraftProfile] = useState(profileData || { displayName: "", avatarUrl: "" });
  const [phase, setPhase] = useState("enter");
  const [activeTab, setActiveTab] = useState("profile");
  const [croppingImageSrc, setCroppingImageSrc] = useState(null);

  // App auto-updater state
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateMessage, setUpdateMessage] = useState("");
  const [latestDownloadUrl, setLatestDownloadUrl] = useState("");

  React.useEffect(() => {
    if (isDesktop && window.amyMusicDesktop?.getAppVersion) {
      window.amyMusicDesktop.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
    // Trigger open animation
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
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

  const tabs = [
    { id: "profile", label: "Профиль", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
{ id: "audio", label: "Аудио", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> },
    { id: "system", label: "Система", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: "developer", label: "Разработчик", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-.273l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> }
  ];

  const handleClose = () => {
    setPhase("exit");
    setTimeout(onClose, 280);
  };

  useEscapeKey(true, handleClose);

  // Auto-apply setting changes
  const updateField = (field, value) => {
    setDraft((current) => {
      const nextSettings = { ...current, [field]: value };
      onSave(nextSettings);
      if (field === "appearance") {
        applyAppearanceSettings(value);
      }
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

  const backdropClass = phase === "open" ? "opacity-100" : "opacity-0";
  const panelClass = phase === "open"
    ? "opacity-100 translate-y-0 scale-100"
    : phase === "exit"
      ? "opacity-0 translate-y-8 scale-95"
      : "opacity-0 translate-y-8 scale-95";

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

      <div key="settings-overlay" className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-4">
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-xl transition-opacity duration-300 ease-out ${backdropClass}`}
          onClick={handleClose}
        />
        <div
          key="settings-window-box"
          className={`flex flex-col relative w-full max-w-full md:max-w-2xl max-h-[92vh] md:max-h-[85vh] overflow-hidden rounded-t-3xl md:rounded-3xl bg-[#0a0a0c] text-white shadow-2xl transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1)] ${panelClass}`}
        >
          {/* Header */}
          <div className="shrink-0 z-20 bg-[#0a0a0c]/95 backdrop-blur-xl px-5 pt-5 pb-3 border-b border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black tracking-tight">Настройки</h2>
              <button
                type="button"
                onClick={handleClose}
                className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition active:scale-95"
                aria-label="Закрыть"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition active:scale-95 ${
                    activeTab === tab.id
                      ? "bg-white text-black"
                      : "bg-white/[0.05] text-white/50 hover:bg-white/[0.1] hover:text-white"
                  }`}
                >
                  <div className={`${activeTab === tab.id ? "opacity-80" : "opacity-50"}`}>
                    {tab.icon}
                  </div>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 custom-scrollbar">
            {activeTab === "profile" && (
              <div key="profile" className="animate-[fadeIn_0.3s_ease-out] pt-4">
                <div className="flex flex-col items-center gap-5 mb-8">
                  <div
                    className="group relative h-28 w-28 cursor-pointer overflow-hidden rounded-full bg-white/[0.04] shadow-xl transition hover:ring-2 hover:ring-white/20"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {draftProfile.avatarUrl ? (
                      <img src={draftProfile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="h-12 w-12 text-white/15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Изменить</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarFileSelect} />
                  </div>

                  <div className="w-full max-w-xs">
                    <input
                      type="text"
                      value={draftProfile.displayName}
                      onChange={(e) => updateProfileField("displayName", e.target.value)}
                      placeholder="Никнейм"
                      className="w-full bg-white/[0.04] rounded-xl px-4 py-3 text-center text-base font-bold text-white placeholder-white/20 outline-none border border-transparent focus:border-white/15 transition"
                    />
                  </div>
                </div>

 
              </div>
            )}

 

            {activeTab === "audio" && (
              <div key="audio" className="animate-[fadeIn_0.3s_ease-out] pt-4 space-y-3">
                <SettingsToggleInline title="Кэширование треков" description="Мгновенное повторное воспроизведение" checked={draft.audioCacheEnabled !== false} onChange={(val) => updateField("audioCacheEnabled", val)} />
                {draft.audioCacheEnabled !== false && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                    <span className="text-xs font-semibold text-white/50">Занято: <strong className="text-white">{audioCacheSize || "0 MB"}</strong></span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); clearAudioCache(); }} className="rounded-full bg-red-500/15 px-3.5 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/25 transition active:scale-95">Очистить</button>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4">
                  <div>
                    <p className="text-sm font-bold text-white">Эквалайзер</p>
                    <p className="text-[11px] font-medium text-white/35 mt-0.5">Настройка частот</p>
                  </div>
                  <button type="button" onClick={() => setIsEqualizerOpen(true)} className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-[11px] font-bold text-white transition active:scale-95">Открыть</button>
                </div>

                <SettingsToggleInline title="Кроссфейд" description="Плавное затухание между треками" checked={Boolean(draft.crossfadeEnabled)} onChange={(val) => updateField("crossfadeEnabled", val)} />
                {draft.crossfadeEnabled && (
                  <div className="rounded-xl bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-white/50">Длительность</span>
                      <span className="text-xs font-black text-white">{draft.crossfadeSeconds || 4} сек</span>
                    </div>
                    <div className="player-seek-wrap relative h-5">
                      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-white/40" style={{ width: `${((draft.crossfadeSeconds || 4) / 12) * 100}%` }} />
                      </div>
                      <input type="range" min="1" max="12" value={Number(draft.crossfadeSeconds) || 4} onChange={(event) => updateField("crossfadeSeconds", Number(event.target.value))} className="player-seek-slider" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "system" && (
              <div key="system" className="animate-[fadeIn_0.3s_ease-out] pt-4 space-y-3">
                {!isDesktop && (
                  <div className="rounded-xl bg-white/[0.03] p-3.5 mb-2 text-center">
                    <p className="text-[11px] font-semibold text-white/35">Некоторые функции доступны только в ПК-приложении</p>
                  </div>
                )}
                <SettingsToggleInline title="Автозапуск" description="При входе в систему" checked={Boolean(draft.appLaunchOnStartup)} onChange={(val) => updateField("appLaunchOnStartup", val)} disabled={!isDesktop} />
                <SettingsToggleInline title="Свернуть в трей" description="Прятать вместо закрытия" checked={Boolean(draft.appMinimizeToTray)} onChange={(val) => updateField("appMinimizeToTray", val)} disabled={!isDesktop} />
                <SettingsToggleInline title="Discord RPC" description="Трек в статусе Discord" checked={draft.discordRpcEnabled !== false} onChange={(val) => updateField("discordRpcEnabled", val)} disabled={!isDesktop} />

                <div className="rounded-2xl bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white">Обновление</p>
                      <p className="text-[11px] font-medium text-white/35 mt-0.5">{isDesktop ? `v${appVersion}` : "Веб-версия"}</p>
                    </div>
                    {isDesktop ? (
                      <button type="button" disabled={updateStatus === "checking" || updateStatus === "downloading"} onClick={handleCheckOrStartUpdate} className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-[11px] font-bold text-white transition active:scale-95 disabled:opacity-50">
                        {updateStatus === "checking" && "Проверка..."}{updateStatus === "idle" && "Проверить"}{updateStatus === "up-to-date" && "Актуально ✓"}{updateStatus === "has-update" && "Обновить 🚀"}{updateStatus === "downloading" && `${updateProgress}%`}
                      </button>
                    ) : (
                      <a href="/api/download-app" target="_blank" rel="noopener noreferrer" download className="rounded-full bg-white/10 hover:bg-white/20 px-4 py-2 text-[11px] font-bold text-white transition active:scale-95">Скачать .exe</a>
                    )}
                  </div>
                  {updateStatus === "downloading" && (
                    <div className="mt-3 w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-white/50 h-full transition-all duration-300 rounded-full" style={{ width: `${updateProgress}%` }} />
                    </div>
                  )}
                  {updateMessage && <p className="mt-2 text-[11px] font-medium text-white/50">{updateMessage}</p>}
                </div>
              </div>
            )}

            {activeTab === "developer" && (
              <div key="developer" className="animate-[fadeIn_0.3s_ease-out] pt-4 space-y-5">
                <div className="rounded-xl bg-yellow-500/10 p-3.5">
                  <p className="text-[11px] font-semibold text-yellow-500/80">⚠️ Только для опытных пользователей</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">SoundCloud Client ID</label>
                  <input value={draft.soundCloudClientId} onChange={(event) => updateField("soundCloudClientId", event.target.value)} className="w-full bg-white/[0.03] rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none border border-transparent focus:border-white/15 transition" placeholder="client_id" spellCheck={false} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">SoundCloud Client Secret</label>
                  <input value={draft.soundCloudClientSecret} onChange={(event) => updateField("soundCloudClientSecret", event.target.value)} type="password" className="w-full bg-white/[0.03] rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none border border-transparent focus:border-white/15 transition" placeholder="Опционально" spellCheck={false} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">HTTP Proxies</label>
                  <textarea value={draft.soundCloudHttpProxies} onChange={(event) => updateField("soundCloudHttpProxies", event.target.value)} className="h-28 w-full resize-none bg-white/[0.03] rounded-xl px-4 py-3 font-mono text-sm font-bold text-white outline-none border border-transparent focus:border-white/15 transition custom-scrollbar" placeholder={"45.141.185.15:5882\n163.5.189.210:3888"} spellCheck={false} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

function SettingsToggleInline({ title, description, checked, onChange, disabled = false }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white/[0.03] p-4 transition hover:bg-white/[0.05] ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        {description && <p className="text-[11px] font-medium text-white/35 mt-0.5">{description}</p>}
      </div>
      <div className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-white/40" : "bg-white/10"}`}>
        <div className={`absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200 shadow-sm ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" disabled={disabled} />
    </label>
  );
}

function SettingsSelectInline({ label, value, onChange, options }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] p-4">
      <span className="text-sm font-bold text-white">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] font-bold text-white outline-none border-none cursor-pointer max-w-[180px]">
        {options.map(opt => <option key={opt.value} value={opt.value} className="bg-[#1a1a1e]">{opt.label}</option>)}
      </select>
    </div>
  );
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function Sidebar({ activeTab, setActiveTab, currentUser, profileData, onProfileSave }) {
  const { playHistory, totalListenedSeconds } = useAudioPlayer();
  const [settings, setSettings] = useState(() => getProfileSettings());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isStaticExpanded, setIsStaticExpanded] = useState(false);

  const sidebarMode = settings.customization?.sidebarMode || "dynamic";
  const isCollapsed = sidebarMode === "static" ? !isStaticExpanded : !isHovered;
  const [pinnedPlaylists, setPinnedPlaylists] = useState(() => getPinnedPlaylists());

  useEffect(() => {
    const update = () => setPinnedPlaylists(getPinnedPlaylists());
    window.addEventListener("amymusic:pinned-updated", update);
    return () => window.removeEventListener("amymusic:pinned-updated", update);
  }, []);

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
    const handleOpenProfile = () => setActiveTab("settings");
    window.addEventListener("amymusic:open-profile", handleOpenProfile);
    return () => window.removeEventListener("amymusic:open-profile", handleOpenProfile);
  }, [setActiveTab]);

  const handleProfileSaveEvent = async (data) => {
    if (onProfileSave) {
      await onProfileSave(data);
    }
  };

  const isDesktop = Boolean(typeof window !== "undefined" && window.amyMusicDesktop);

  return (
    <>
      <aside
        className={`hidden md:flex shrink-0 flex-col justify-center py-4 font-medium transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] relative z-20 ${isCollapsed ? "w-[72px] bg-transparent" : "w-[200px] bg-black/80 backdrop-blur-md rounded-r-2xl"}`}
        onMouseEnter={() => { if (sidebarMode === "dynamic") setIsHovered(true); }}
        onMouseLeave={() => { if (sidebarMode === "dynamic") setIsHovered(false); }}
      >
        <nav className="flex flex-col gap-1 w-full">
          {sidebarMode === "static" && (
            <div className={`flex items-center mb-2 px-3 ${isCollapsed ? "justify-center" : "justify-between"}`}>
              {!isCollapsed && (
                <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest px-2">Меню</span>
              )}
              <button
                type="button"
                onClick={() => setIsStaticExpanded((prev) => !prev)}
                className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title={isCollapsed ? "Развернуть панель" : "Свернуть панель"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${!isCollapsed ? "rotate-180" : ""}`}>
                  <path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>
                </svg>
              </button>
            </div>
          )}
            {/* Pinned playlists */}
            {pinnedPlaylists.length > 0 && (
              <div className={`flex flex-col gap-1 w-full mb-2 pb-2 border-b border-white/[0.06] transition-all duration-300`}>
                {pinnedPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      if (pl.type === "artist" && pl.artistData) {
                        // Open artist view
                        window.dispatchEvent(new CustomEvent("amymusic:open-pinned-artist", { detail: pl.artistData }));
                      } else {
                        setActiveTab("collection");
                        window.dispatchEvent(new CustomEvent("amymusic:open-pinned-playlist", { detail: pl.id }));
                      }
                    }}
                    title={pl.title}
                    className="group flex w-full items-center gap-3.5 rounded-full py-1.5 px-[22px] text-sm transition-all duration-300 overflow-hidden hover:bg-white/5"
                  >
                    <img
                      src={pl.cover || "/logo.png"}
                      alt={pl.title}
                      className={`h-7 w-7 shrink-0 object-cover shadow-md transition group-hover:scale-105 ${pl.type === "artist" ? "rounded-full" : "rounded-lg"}`}
                    />
                    <span className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100"}`}>
                      <span className="text-[13px] font-semibold text-white/70 whitespace-nowrap truncate block">{pl.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
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

        <div className="absolute bottom-0 left-0 right-0 mb-4 w-full space-y-2 overflow-hidden">
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

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className="group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[18px] text-left text-sm transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] text-white/50 hover:text-white/80 overflow-hidden hover:bg-white/[0.04]"
            title={isCollapsed ? (profileData?.displayName || currentUser || "Local") : undefined}
          >
            <div className="relative h-9 w-9 shrink-0">
              <img src={profileData?.avatarUrl || "/user.svg"} alt="" className="h-full w-full rounded-full bg-[var(--player-accent)] object-cover opacity-85 transition group-hover:opacity-100 p-1" />
            </div>
            <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
              <span className="flex flex-col whitespace-nowrap">
                <span className="block truncate font-bold text-white max-w-[120px]">
                  {profileData?.displayName || currentUser || "Local"}
                </span>
              </span>
            </span>
          </button>
        </div>
      </aside>
    </>
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

function splitArtistNames(value = "") {
  if (!value) return [];
  const parts = String(value).split(/\s*(?:,|&|\/|\+|\b[xX]\b|×|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|при\s+уч(?:\.|астии)?|\bуч\.?|;)\s*/i);
  const seen = new Set();
  const result = [];
  parts.forEach((p) => {
    const name = p.trim();
    const key = name.toLowerCase();
    if (name && key !== "unknown artist" && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  });
  return result;
}

function getTrackArtists(track) {
  if (!track) return [];
  const avatar = (track.artistAvatar && !track.artistAvatar.includes("logo.png"))
    ? track.artistAvatar
    : ((track.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg");

  const result = [];

  if (Array.isArray(track.artists) && track.artists.length > 0) {
    track.artists.forEach((art) => {
      const artName = art.name || art.username || "";
      const splitNames = splitArtistNames(artName);
      if (splitNames.length > 1) {
        splitNames.forEach((n) => {
          result.push({
            id: n,
            name: n,
            username: n,
            avatar: art.avatar || avatar,
            permalinkUrl: art.permalinkUrl || track.artistPermalinkUrl || ""
          });
        });
      } else {
        result.push({
          id: art.id || artName,
          name: artName || track.artist || "Unknown Artist",
          username: art.username || artName || track.artist,
          avatar: art.avatar || avatar,
          permalinkUrl: art.permalinkUrl || track.artistPermalinkUrl || ""
        });
      }
    });
  } else {
    const rawArtist = track.artist || track.uploaderName || "";
    const splitNames = splitArtistNames(rawArtist);
    if (splitNames.length > 0) {
      splitNames.forEach((n) => {
        result.push({
          id: n,
          name: n,
          username: n,
          avatar,
          permalinkUrl: track.artistPermalinkUrl || ""
        });
      });
    } else {
      result.push({
        id: track.artistId || "",
        name: rawArtist || "Unknown Artist",
        username: rawArtist || "Unknown Artist",
        avatar,
        permalinkUrl: track.artistPermalinkUrl || ""
      });
    }
  }

  const seen = new Set();
  return result.filter((art) => {
    const key = (art.name || art.username || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ArtistAvatar({ artist, track, size = "h-4 w-4", className = "" }) {
  const artistName = (artist?.name || artist?.username || "").trim();
  const [avatarUrl, setAvatarUrl] = useState(() => {
    const cached = getYandexCachedArtistAvatar(artistName);
    if (cached) return cached;
    if (artist?.avatar && !artist.avatar.includes("logo.png") && !artist.avatar.includes("user.svg")) {
      return artist.avatar;
    }
    if (track?.artistAvatar && !track.artistAvatar.includes("logo.png") && !track.artistAvatar.includes("user.svg")) {
      return track.artistAvatar;
    }
    return "";
  });

  useEffect(() => {
    if (!artistName) return;
    let isMounted = true;

    const cached = getYandexCachedArtistAvatar(artistName);
    if (cached) {
      setAvatarUrl(cached);
      return;
    }

    // Automatically fetch the first photo from Yandex Music
    fetchYandexArtistAvatar(artistName).then((url) => {
      if (isMounted && url) {
        setAvatarUrl(url);
      }
    });

    const handleUpdate = (e) => {
      if (e.detail?.name?.toLowerCase().trim() === artistName.toLowerCase().trim() && isMounted && e.detail.avatar) {
        setAvatarUrl(e.detail.avatar);
      }
    };

    window.addEventListener("amymusic:artist-avatar-updated", handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener("amymusic:artist-avatar-updated", handleUpdate);
    };
  }, [artistName]);

  const fallbackUrl = (artist?.avatar && !artist.avatar.includes("logo.png"))
    ? artist.avatar
    : ((track?.artistAvatar && !track.artistAvatar.includes("logo.png"))
      ? track.artistAvatar
      : ((track?.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg"));

  const displaySrc = avatarUrl || fallbackUrl;

  return (
    <img
      src={displaySrc}
      alt={artistName}
      className={`${size} shrink-0 rounded-full object-cover ring-1 ring-white/20 transition group-hover/artist:scale-110 group-hover/artist:ring-[var(--player-accent)] ${className}`}
      onError={(e) => {
        if (e.currentTarget.src !== "/user.svg") {
          e.currentTarget.src = "/user.svg";
        }
      }}
    />
  );
}

export function ArtistLinks({ track, onOpenArtist, className = "text-xs text-white/40", showAvatar = true, avatarSize = "h-4 w-4" }) {
  const artists = getTrackArtists(track).filter((artist) => artist.name || artist.username);

  return (
    <div className={`flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap ${className}`}>
      {artists.map((artist, index) => {
        const artistName = artist.name || artist.username || "";
        const avatarUrl = getYandexCachedArtistAvatar(artistName) ||
          (artist.avatar && !artist.avatar.includes("logo.png") ? artist.avatar : "") ||
          (track.artistAvatar && !track.artistAvatar.includes("logo.png") ? track.artistAvatar : "") ||
          (track.cover && !track.cover.includes("logo.png") ? track.cover : "/user.svg");

        return (
          <React.Fragment key={`${artist.id || artist.name}-${index}`}>
            {index > 0 && <span className="mx-0.5 font-light text-white/35">×</span>}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const isYandex = track.source === "yandex" || String(track.id).startsWith("yandex_");
                onOpenArtist?.({
                  id: isYandex ? "" : (artist.id || ""),
                  name: artist.name || artist.username,
                  username: artist.username || artist.name,
                  avatar: getYandexCachedArtistAvatar(artistName) || avatarUrl,
                  permalinkUrl: artist.permalinkUrl || "",
                  followers: 0,
                  followings: 0,
                  trackCount: 0,
                  city: "",
                  country: "",
                  tags: []
                });
              }}
              className="inline-flex items-center gap-1.5 max-w-[200px] truncate transition hover:text-white hover:underline group/artist"
            >
              {showAvatar && (
                <ArtistAvatar artist={artist} track={track} size={avatarSize} />
              )}
              <span className="truncate">{artist.name || artist.username}</span>
            </button>
          </React.Fragment>
        );
      })}
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
      <div className="relative min-h-[300px] max-md:min-h-0 overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5 max-md:px-4 max-md:pb-3 max-md:pt-2">
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
            className="mb-5 max-md:mb-2 flex h-10 w-10 max-md:h-8 max-md:w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7 max-md:flex-col max-md:items-center max-md:text-center max-md:gap-4">
            <img 
              src={album.cover} 
              alt={album.title} 
              onClick={() => setIsCoverExpanded(true)}
              className="h-52 w-52 max-md:h-56 max-md:w-56 shrink-0 rounded-3xl border border-white/10 object-cover shadow-2xl cursor-pointer transition hover:scale-105 active:scale-95" 
            />
            <div className="max-w-4xl pb-2 max-md:flex max-md:flex-col max-md:items-center max-md:w-full">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/35 max-md:text-center">
                {album.kind === "playlist" ? "Плейлист" : "Альбом"}
              </p>
              <h1 className="text-5xl max-md:text-2xl font-black tracking-tight text-white max-md:text-center break-words">{album.title}</h1>
              <p className="mt-2 text-base max-md:text-sm font-bold text-white/48 max-md:text-center">{album.artist}</p>
              <p className="mt-3 text-sm max-md:text-xs font-bold text-white/38 max-md:text-center">
                {tracks.length || album.trackCount || 0} треков
              </p>
              <div className="mt-6 flex flex-row items-center justify-center gap-3 max-md:w-full">
                <button
                  type="button"
                  onClick={onPlayAlbum}
                  disabled={!tracks.length}
                  className="rounded-full bg-white px-5 py-2.5 max-md:px-4 max-md:py-2 text-sm max-md:text-xs font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  ▶ Слушать все
                </button>
                <button
                  type="button"
                  onClick={() => onToggleRelease?.(album)}
                  className={[
                    "grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] active:scale-95 shrink-0",
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
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-35 shrink-0"
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



const TypewriterHeading = () => {
  const phrases = [
    "Что будем слушать?",
    "Открывай новых артистов",
    "Ищи любимые треки",
    "Включай свой вайб"
  ];
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex];
    let timeoutId;

    if (isDeleting) {
      if (text.length > 0) {
        timeoutId = setTimeout(() => setText(currentPhrase.substring(0, text.length - 1)), 30);
      } else {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }
    } else {
      if (text.length < currentPhrase.length) {
        timeoutId = setTimeout(() => setText(currentPhrase.substring(0, text.length + 1)), 80);
      } else {
        timeoutId = setTimeout(() => setIsDeleting(true), 2500);
      }
    }

    return () => clearTimeout(timeoutId);
  }, [text, isDeleting, phraseIndex]);

  return (
    <div className="mb-10 transition-opacity duration-500 flex items-center justify-center h-[48px] md:h-[60px]">
      <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
        {text}
        <span className="animate-pulse ml-1 text-white/40">|</span>
      </h1>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={
      "dotify-tab-btn flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-bold shrink-0 cursor-pointer transition-colors duration-300 " +
      (active
        ? "bg-white text-black shadow-lg"
        : "bg-transparent text-white/60 hover:text-white hover:bg-white/10")
    }
  >
    {icon}
    {label}
  </button>
);

function SearchPanel({ onOpenArtist }) {
  const { playHistory, clearHistory, likedTracks, dislikedTrackIds, dislikedTracks, playTrack, savedReleaseIds, toggleSavedRelease } = useAudioPlayer();
  const [query, setQuery] = useState("");
  const [activeSearchTab, setActiveSearchTab] = useState("all");
  const [tracks, setSearchTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  
  // New States for dynamic UI
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const recentTracksScrollRef = useRef(null);
  const searchTracksScrollRef = useRef(null);
  const searchArtistsScrollRef = useRef(null);
  const searchAlbumsScrollRef = useRef(null);
  useHorizontalScroll(recentTracksScrollRef, [playHistory]);
  useHorizontalScroll(searchTracksScrollRef, [tracks]);
  useHorizontalScroll(searchArtistsScrollRef, [artists]);
  useHorizontalScroll(searchAlbumsScrollRef, [albums]);

  useEffect(() => {
    let timer;
    if (isFocused) {
      setShowDropdown(true);
    } else {
      timer = setTimeout(() => setShowDropdown(false), 200);
    }
    return () => clearTimeout(timer);
  }, [isFocused]);
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('amy_search_history')) || [];
    } catch {
      return [];
    }
  });

  const saveHistory = (item) => {
    const updated = [item, ...searchHistory.filter(h => h.id !== item.id || h.type !== item.type)].slice(0, 10);
    setSearchHistory(updated);
    localStorage.setItem('amy_search_history', JSON.stringify(updated));
  };

  const removeHistoryItem = (e, item) => {
    e.stopPropagation();
    const updated = searchHistory.filter(h => h.id !== item.id || h.type !== item.type);
    setSearchHistory(updated);
    localStorage.setItem('amy_search_history', JSON.stringify(updated));
  };

  const clearFullHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('amy_search_history');
  };

  const runSearch = async (nextQuery = query) => {
    const normalizedQuery = nextQuery.trim();
    if (!normalizedQuery) return;

    setHasSearched(true);
    setIsFocused(false);
    // Preserving the active tab!
    setIsSearching(true);
    setSearchError("");
    
    // Save text query to history
    saveHistory({ id: normalizedQuery, type: 'text', title: normalizedQuery });

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

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || hasSearched) return undefined;

    let isCurrent = true;
    const timer = setTimeout(async () => {
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
        if (isCurrent) setSearchError(error.message || "Ошибка поиска");
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 300); // Fast debounce for suggestions

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, hasSearched]);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (query.trim()) {
      runSearch();
    }
  };

  const openArtist = async (artist) => {
    const title = artist.title || artist.name || artist.username;
    const cover = artist.cover || artist.avatar;
    const id = artist.id || artist.username;
    
    // Validate we actually have a title, otherwise don't save broken history
    if (title) {
        saveHistory({ id, type: 'artist', title, cover });
    }
    
    // Ensure the raw artist object passed down has the correct properties if it came from a suggestion
    const rawArtist = artist.title ? { ...artist, name: artist.title, avatar: artist.cover } : artist;
    onOpenArtist?.(rawArtist);
  };

  const openAlbum = async (album) => {
    saveHistory({ id: album.id, type: 'album', title: album.title, cover: album.cover });
    setActiveAlbum(album);
    setIsAlbumLoading(true);
    try {
      const fullAlbum = await getAlbumDetails(album, { username: album.artist, name: album.artist, avatar: album.cover });
      setActiveAlbum(fullAlbum);
    } finally {
      setIsAlbumLoading(false);
    }
  };

  const handleSuggestionClick = (item) => {
    if (item.type === 'text') {
      setQuery(item.title);
      runSearch(item.title);
    } else if (item.type === 'artist') {
      openArtist(item);
    } else if (item.type === 'album') {
      openAlbum(item);
    } else {
      setQuery(item.title);
      runSearch(item.title);
    }
  };

  const loadArtistsTab = async () => {
    setActiveSearchTab("artists");
    if (!artists.length && query) {
      setIsSearching(true);
      try { setArtists(await searchArtists(query.trim())); } 
      catch {} finally { setIsSearching(false); }
    }
  };

  const loadAlbumsTab = async () => {
    setActiveSearchTab("albums");
    if (!albums.length && query) {
      setIsSearching(true);
      try { setAlbums(await searchAlbums(query.trim())); } 
      catch {} finally { setIsSearching(false); }
    }
  };

  const loadPlaylistsTab = async () => {
    setActiveSearchTab("playlists");
    if (!playlists.length && query) {
      setIsSearching(true);
      try { setPlaylists(await searchPlaylists(query.trim())); } 
      catch {} finally { setIsSearching(false); }
    }
  };

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

  // Combined history & smart suggestions logic
  const buildSuggestions = () => {
    const q = query.trim();
    if (!q) return searchHistory;

    const suggestions = [];
    
    // 1. Text Query (Exact match)
    suggestions.push({ id: `query-${q}`, type: 'text', title: q });

    // 2. Artists Suggestions
    if ((activeSearchTab === "all" || activeSearchTab === "artists") && artists.length > 0) {
      if (activeSearchTab === "artists") {
        const topArtists = artists.slice(0, 5).map(a => ({
          id: a.id || a.username,
          type: 'artist',
          title: a.name || a.username,
          cover: a.avatar
        }));
        suggestions.push(...topArtists);
      } else {
        const topArtist = artists[0];
        suggestions.push({ 
          id: topArtist.id || topArtist.username, 
          type: 'artist', 
          title: topArtist.name || topArtist.username, 
          cover: topArtist.avatar 
        });
      }
    }

    // 3. Top Tracks
    if (activeSearchTab === "all" || activeSearchTab === "tracks") {
      const topTracks = tracks.slice(0, 3).map(t => ({ 
        id: t.id, 
        type: 'track', 
        title: t.title, 
        cover: t.cover 
      }));
      suggestions.push(...topTracks);
    }

    // 4. Albums if we need more slots
    if (suggestions.length < 6 && (activeSearchTab === "all" || activeSearchTab === "albums") && albums.length > 0) {
      const topAlbum = albums[0];
      suggestions.push({
        id: topAlbum.id,
        type: 'album',
        title: topAlbum.title,
        cover: topAlbum.cover
      });
    }
    
    // 5. Playlists if we need more slots
    if (suggestions.length < 6 && (activeSearchTab === "playlists") && playlists.length > 0) {
      const topPlaylist = playlists[0];
      suggestions.push({
        id: topPlaylist.id,
        type: 'album', // OpenAlbum handles playlists in this app
        title: topPlaylist.title,
        cover: topPlaylist.cover
      });
    }

    return suggestions.slice(0, 6);
  };

  const dropdownItems = buildSuggestions();

  return (
    <section className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#000000] relative">
      
      {/* Search Header Area */}
      <div className={`transition-all duration-700 ease-in-out shrink-0 w-full flex flex-col justify-center items-center ${hasSearched ? 'pt-4 md:pt-8 h-[auto]' : 'h-full pt-[8vh]'}`}>
        
        {/* Typewriter Search Heading (Only when Idle) */}
        {!hasSearched && <TypewriterHeading />}

        {/* Search Bar Container */}
        <div className="relative w-full max-w-[600px] px-4 z-50">
          <form
            onSubmit={handleSearch}
            className={`flex h-[52px] w-full items-center gap-3 rounded-full border border-white/5 bg-[#121212] px-5 text-[#808080] transition-colors ${isFocused ? 'border-white/20 bg-[#1a1a1a] shadow-2xl' : 'hover:border-white/10 hover:bg-[#181818]'}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/40">
              <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              onChange={(e) => {
                setQuery(e.target.value);
                if (hasSearched) setHasSearched(false);
              }}
              placeholder="Что вы хотите послушать?"
              className="w-full bg-transparent text-[16px] text-white placeholder:text-white/40 focus:outline-none font-medium"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setHasSearched(false); }} className="text-white/40 hover:text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
            
          </form>

          {/* Dropdown / History */}
          {showDropdown && (
            <div className={`absolute top-[60px] left-4 right-4 bg-[#121212] rounded-[16px] border border-white/5 shadow-2xl overflow-y-auto max-h-[calc(50vh-120px)] custom-scrollbar z-50 py-2 transition-all duration-200 ease-out origin-top ${isFocused ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'}`}>
              {dropdownItems.length > 0 ? dropdownItems.map((item, i) => (
                <div key={`${item.id}-${i}`} onClick={() => handleSuggestionClick(item)} style={{ animationDelay: `${i * 30}ms` }} className="flex items-center justify-between px-5 py-3 hover:bg-white/5 cursor-pointer transition opacity-0 animate-dropdown-item">
                  <div className="flex items-center gap-4">
                    {item.type === 'text' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/40"><path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : item.type === 'artist' ? (
                      item.cover ? (
                        <img src={item.cover} className="w-8 h-8 rounded-full object-cover" onError={(e) => e.target.style.display='none'} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </div>
                      )
                    ) : (
                      <img src={item.cover} className="w-8 h-8 rounded-md object-cover" />
                    )}
                    <span className="text-[15px] font-semibold text-white truncate max-w-[400px]">{item.title}</span>
                  </div>





        
                  {!query.trim() && (
                    <button onClick={(e) => removeHistoryItem(e, item)} className="text-white/20 hover:text-white/60 transition p-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  )}
                </div>
              )) : (
                <div className="px-5 py-4 text-center text-white/40 text-sm font-medium">Нет недавних запросов</div>
              )}
            </div>
          )}
        </div>

        {/* Tabs - Always visible */}
        <div className="mt-6 w-full px-4 transition-all duration-500 opacity-100 max-h-[100px]">
          <div className="flex items-center justify-center gap-2 overflow-x-auto custom-scrollbar pb-2">
            <TabButton active={activeSearchTab === "all"} onClick={() => setActiveSearchTab("all")} label="Все" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>} />
            <TabButton active={activeSearchTab === "tracks"} onClick={() => setActiveSearchTab("tracks")} label="Треки" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>} />
            <TabButton active={activeSearchTab === "playlists"} onClick={loadPlaylistsTab} label="Плейлисты" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>} />
            <TabButton active={activeSearchTab === "albums"} onClick={loadAlbumsTab} label="Альбомы" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>} />
            <TabButton active={activeSearchTab === "artists"} onClick={loadArtistsTab} label="Артисты" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>} />
          </div>
        </div>

          {/* Recent Tracks Carousel (Only when Idle) */}
          {!hasSearched && playHistory && playHistory.length > 0 && (
            <div className="mt-8 w-full px-4 md:px-8 animate-slide-up-fade">
              <div ref={recentTracksScrollRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-6 snap-x">
                {playHistory.slice(0, 15).map((track, i) => (
                  <button
                    key={`${track.id}-${i}`}
                    type="button"
                    onClick={() => playTrack(track, playHistory)}
                    className="group w-[140px] shrink-0 text-left snap-start transition-transform duration-300 hover:scale-[1.02]"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-[16px] bg-white/[0.04] shadow-md group-hover:shadow-xl transition-shadow duration-300">
                      <img src={track.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/30 pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="black" className="ml-1"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 truncate text-[15px] font-bold text-white transition-colors group-hover:text-white">{track.title}</p>
                    <p className="truncate text-[13px] font-medium text-white/50">{track.artist}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>

      
        {/* Results Body */}
      {hasSearched && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-32 animate-fade-in">
          
          {/* ALL TAB LAYOUT */}
          {activeSearchTab === "all" && (
            <div className="space-y-12">
              {/* Tracks Horizontal */}
              {tracks.length > 0 && (
                <section>
                  <h2 className="text-2xl font-black text-white mb-6">Треки</h2>
                  <div ref={searchTracksScrollRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
                    {tracks.slice(0, 10).map(track => (
                      <div key={track.id} onClick={() => playTrack(track, tracks)} onContextMenu={(e) => openContextMenu(e, track)} className="group snap-start shrink-0 w-[160px] flex flex-col gap-3 cursor-pointer">
                        <div className="w-[160px] h-[160px] relative rounded-2xl overflow-hidden shadow-lg">
                          <img src={track.cover} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:scale-105 active:scale-95">
                               <svg width="24" height="24" viewBox="0 0 24 24" fill="black" className="ml-1"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-[15px] font-bold text-white truncate group-hover:text-white/90">{track.title}</p>
                          <p className="text-[13px] text-white/50 truncate mt-0.5">{track.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Artists Horizontal */}
              {artists.length > 0 && (
                <section>
                  <h2 className="text-2xl font-black text-white mb-6">Артисты</h2>
                  <div ref={searchTracksScrollRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
                    {artists.slice(0, 8).map(artist => (
                      <div key={artist.id || artist.username} onClick={() => openArtist(artist)} className="group snap-start shrink-0 w-[140px] flex flex-col items-center gap-3 cursor-pointer text-center">
                        <div className="w-[140px] h-[140px] relative rounded-full overflow-hidden shadow-lg">
                          <img src={artist.avatar} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        </div>
                        <div>
                          <p className="text-[15px] font-bold text-white truncate">{artist.name || artist.username}</p>
                          <p className="text-[12px] text-white/40 mt-1">Артист</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* OTHER TABS LAYOUT */}
          {activeSearchTab === "artists" && (
             <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
               {artists.map((artist) => (
                 <ArtistCard key={artist.id || artist.username} artist={artist} onClick={openArtist} />
               ))}
             </div>
          )}
          {activeSearchTab === "albums" && (
             <div className="flex flex-wrap gap-5">
               {albums.map((album) => (
                 <AlbumSearchCard key={album.id} album={album} onClick={openAlbum} />
               ))}
             </div>
          )}
          {activeSearchTab === "playlists" && (
             <div className="flex flex-wrap gap-5">
               {playlists.map((playlist) => (
                 <AlbumSearchCard key={playlist.id} album={playlist} onClick={openAlbum} />
               ))}
             </div>
          )}
          {activeSearchTab === "tracks" && (
             <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-4">
               {tracks.map((track) => (
                 <div key={track.id} onClick={() => playTrack(track, tracks)} onContextMenu={(e) => openContextMenu(e, track)} className="group flex items-center gap-4 rounded-xl p-3 text-left transition hover:bg-white/5 active:bg-white/10 active:scale-[0.99] cursor-pointer">
                    <div className="flex h-12 w-12 shrink-0 relative">
                      <img src={track.cover} className="h-12 w-12 rounded-md object-cover shadow-md" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block max-w-full truncate text-[15px] font-bold text-white">{track.title}</span>
                      <span className="block text-[13px] text-white/50">{track.artist}</span>
                    </div>
                 </div>
               ))}
             </div>
          )}

        </div>
      )}
    </section>
  );
}
function formatListeners(count) {
  if (!count || count <= 0) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)} млн`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)} тыс.`;
  return `${count}`;
}

function ChartPositionBadge({ position, progress, shift }) {
  const isTop1 = position === 1;
  const isTop2 = position === 2;
  const isTop3 = position === 3;

  return (
    <div className="flex flex-col items-center justify-center w-10 shrink-0 select-none">
      <span
        className={[
          "text-sm font-black transition-colors",
          isTop1
            ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
            : isTop2
            ? "text-slate-300 drop-shadow-[0_0_6px_rgba(203,213,225,0.4)]"
            : isTop3
            ? "text-amber-600 drop-shadow-[0_0_6px_rgba(217,119,6,0.4)]"
            : "text-white/40 group-hover:text-white/80"
        ].join(" ")}
      >
        {position}
      </span>
      {progress === "up" && (
        <span className="flex items-center text-[10px] font-bold text-emerald-400 leading-none mt-0.5">
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>
          {shift > 0 ? shift : ""}
        </span>
      )}
      {progress === "down" && (
        <span className="flex items-center text-[10px] font-bold text-rose-400 leading-none mt-0.5">
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 20l8-8h-6v-8h-4v8h-6z"/></svg>
          {shift > 0 ? shift : ""}
        </span>
      )}
      {progress === "new" && (
        <span className="text-[9px] font-black tracking-wider uppercase text-purple-400 bg-purple-500/20 px-1 py-0.2 rounded mt-0.5">
          NEW
        </span>
      )}
      {progress === "same" && (
        <span className="text-[12px] font-bold text-white/20 leading-none mt-0.5">•</span>
      )}
    </div>
  );
}

function TrendsPanel({ onOpenArtist, onOpenAlbum }) {
  const { playTrack, currentTrack, togglePlay } = useAudioPlayer();
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadYandexChart = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const top100 = await getYandexChartTop100();
      setTracks(top100);
    } catch (err) {
      console.warn("Yandex Chart unavailable, using SoundCloud recommendations fallback:", err);
      try {
        const recs = await getRecommendedTracks();
        if (recs && recs.length > 0) {
          setTracks(recs);
          return;
        }
      } catch (e) {
        console.error("Fallback to SoundCloud recommendations failed:", e);
      }
      setError(err.message || "Не удалось загрузить чарт");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadYandexChart();
  }, [loadYandexChart]);

  return (
    <section className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#000000] relative">
      {/* Header Area */}
      <div className="shrink-0 w-full flex flex-col items-center pt-4 md:pt-6 pb-4 px-4">

        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight text-center">Чарты</h1>
        <p className="mt-2 text-sm md:text-base text-white/40 font-medium text-center max-w-md">
          Самые популярные треки прямо сейчас
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-5">
          {tracks.length > 0 && (
            <button
              type="button"
              onClick={() => playTrack(tracks[0], tracks)}
              className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-sm font-bold text-black shadow-lg transition hover:scale-105 active:scale-95"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Слушать
            </button>
          )}
          <button
            type="button"
            onClick={loadYandexChart}
            disabled={isLoading}
            title="Обновить чарт"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 fill-current ${isLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24">
              <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Results Body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-32 animate-fade-in">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-red-500/10 p-4 border border-red-500/20 text-sm text-red-300">
            <span>{error}</span>
            <button type="button" onClick={loadYandexChart} className="font-bold underline hover:text-white">Повторить</button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#8341EF]" />
            <span className="text-sm font-semibold">Загрузка...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 w-full">
            {tracks.map((track, index) => (
              <div
                key={track.id || index}
                className="group flex items-center gap-3 sm:gap-4 rounded-xl p-2.5 sm:p-3 text-left transition hover:bg-white/[0.04] active:bg-white/[0.08] active:scale-[0.99] cursor-pointer"
                onClick={() => playTrack(track, tracks)}
              >
                <ChartPositionBadge
                  position={track.chartPosition || index + 1}
                  progress={track.chartProgress}
                  shift={track.chartShift}
                />

                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-md">
                  <img src={track.cover} alt={track.title} className="h-12 w-12 object-cover transition duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-white">{track.title}</span>
                    {track.listeners > 0 && (
                      <span className="hidden md:inline-block rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/40 shrink-0">
                        🎧 {formatListeners(track.listeners)}
                      </span>
                    )}
                  </div>
                  <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
                </div>

                <div className="relative w-16 h-10 flex items-center justify-end shrink-0 select-none" onClick={(e) => e.stopPropagation()}>
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrackInfo({ onOpenFull, onOpenArtist, onOpenAlbum }) {
  const { currentTrack, currentIndex } = useAudioPlayer();
  const prevIndex = React.useRef(currentIndex);
  const slideClass = React.useRef("animate-slideInRight");

  if (currentIndex !== prevIndex.current) {
    slideClass.current = currentIndex > prevIndex.current ? "animate-slideInRight" : "animate-slideInLeft";
    prevIndex.current = currentIndex;
  }

  return (
    <div key={currentTrack?.id} className={`flex w-[320px] max-sm:w-auto max-sm:max-w-[240px] shrink min-w-0 items-center gap-3 ${slideClass.current}`}>
      {/* Track cover */}
      <div 
        onClick={onOpenFull}
        className="group/cover relative shrink-0 cursor-pointer overflow-hidden rounded-[var(--cover-radius,12px)] transition-all duration-300"
      >
        <img
          src={currentTrack.cover}
          alt={currentTrack.title}
          className="h-[50px] w-[50px] object-cover transition duration-300 group-hover/cover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover/cover:opacity-100">
          <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
          </svg>
        </div>
      </div>

      {/* Track Title & Artist Info with Avatars for ALL Artists */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p 
            onClick={onOpenFull}
            className="cursor-pointer truncate text-[15.5px] font-medium text-white hover:underline"
          >
            {currentTrack.title}
          </p>
          <span className="rounded bg-white/10 px-1 text-[10px] text-white/50 max-md:hidden">67+</span>
          <div className="relative max-md:hidden">
            <TrackMenuButton
              track={currentTrack}
              onOpenArtist={onOpenArtist}
              onOpenAlbum={onOpenAlbum}
              placement="top"
            />
          </div>
        </div>

        {/* Display ALL Artists with round avatars & × separator */}
        <div className="mt-0.5">
          <ArtistLinks
            track={currentTrack}
            onOpenArtist={onOpenArtist}
            showAvatar={true}
            className="text-[13.5px] text-white/60 font-medium"
          />
        </div>
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
          className="h-5 w-5 transition-colors" 
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
          ? "bg-white/10 opacity-100"
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
    <div className="flex items-center justify-center gap-4 max-sm:gap-2 shrink-0">
      {controls.map((control) => {
        const isMobileHidden = control.id !== "like" && !control.primary;
        return control.primary ? (
          <button
            key={control.id}
            type="button"
            onClick={control.action}
            aria-label={control.label}
            title={isLoading ? "Прогружаю трек..." : control.label}
            className="grid shrink-0 place-items-center transition hover:scale-105 active:scale-95 max-md:order-2"
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
          <div key={control.id} className={isMobileHidden ? "max-md:hidden" : "max-md:order-1"}>
            <PlayerIconButton
              id={control.id}
              icon={control.icon}
              label={control.label}
              onClick={control.action}
              active={control.active}
              badge={control.badge}
            />
          </div>
        );
      })}
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

function PlayerTools({ onOpenFull, onToggleKaraoke, isKaraokeOpen }) {
  const { currentTrack, currentIndex, effectiveVolume, playTrack, queue, reorderQueue, removeFromQueue, setVolume, toggleMute, isEqualizerOpen, setIsEqualizerOpen } = useAudioPlayer();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const volumeTimerRef = useRef(null);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);
  const [queueDragPos, setQueueDragPos] = useState(null);
  const volumePercent = Math.round(effectiveVolume * 100);

  const handleVolumeMouseEnter = () => {
    if (volumeTimerRef.current) {
      clearTimeout(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }
    setIsVolumeOpen(true);
  };

  const handleVolumeMouseLeave = () => {
    if (volumeTimerRef.current) {
      clearTimeout(volumeTimerRef.current);
    }
    volumeTimerRef.current = setTimeout(() => {
      setIsVolumeOpen(false);
    }, 350);
  };

  useEscapeKey(isQueueOpen, () => {
    setIsQueueOpen(false);
  });

  const profileSettings = getProfileSettings();
  useEffect(() => {
    applyAppearanceSettings(profileSettings?.appearance);
  }, [profileSettings?.appearance]);

  return (
    <div className="flex w-auto items-center justify-end gap-2 max-sm:gap-1 shrink-0 max-md:hidden relative z-50">
      <PlayerIconButton icon="/lyrics.svg" label="Караоке" onClick={onToggleKaraoke} active={isKaraokeOpen} />
      <div className="relative">
        <PlayerIconButton
          icon="/queue.svg"
          label="Очередь"
          onClick={() => setIsQueueOpen((value) => !value)}
          active={isQueueOpen}
        />
        {createPortal(
          <div className={`fixed inset-0 z-[99999] flex justify-end transition-all duration-300 ${isQueueOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div 
              className={`absolute inset-0 bg-black/40 transition-all duration-300 ease-out ${isQueueOpen ? 'backdrop-blur-md opacity-100' : 'backdrop-blur-none opacity-0'}`}
              onClick={() => setIsQueueOpen(false)}
            />
            
            <div 
              className={`relative w-[85%] md:w-[400px] h-full bg-[#0a0a0a] shadow-2xl flex flex-col border-l border-white/5 transition-transform duration-300 ease-out ${isQueueOpen ? 'translate-x-0' : 'translate-x-full'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
                <div>
                  <h3 className="text-[20px] font-bold text-white tracking-tight">Очередь</h3>
                </div>
                <button onClick={() => setIsQueueOpen(false)} className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-full transition">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              
              <div
                className="flex-1 overflow-y-auto custom-scrollbar p-3"
                onWheel={(e) => {
                  if (draggedQueueIndex !== null) {
                    e.currentTarget.scrollTop += e.deltaY;
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  const container = e.currentTarget;
                  const rect = container.getBoundingClientRect();
                  const offsetY = e.clientY - rect.top;
                  if (offsetY < 40) {
                    container.scrollTop -= 10;
                  } else if (rect.height - offsetY < 40) {
                    container.scrollTop += 10;
                  }
                }}
              >
                {(() => {
                  const startIdx = Math.max(0, currentIndex);
                  const visibleQueue = queue.slice(startIdx);
                  if (visibleQueue.length === 0) {
                    return <p className="py-5 text-center text-sm text-white/35">Очередь пустая</p>;
                  }
                  
                  return visibleQueue.map((track, vIndex) => {
                    const actualIndex = startIdx + vIndex;
                    const isCurrent = currentTrack?.id === track.id;
                    const isDragging = draggedQueueIndex === vIndex;
                    const isDragOver = dragOverQueueIndex === vIndex;

                    const itemNode = (
                      <div
                        key={`${track.id}-${actualIndex}`}
                        data-queue-vindex={vIndex}
                        draggable
                        onDragStart={(e) => {
                          if (e.dataTransfer && BLANK_DRAG_IMAGE) {
                            try { e.dataTransfer.setDragImage(BLANK_DRAG_IMAGE, 0, 0); } catch {}
                            e.dataTransfer.setData("text/plain", String(vIndex));
                            e.dataTransfer.effectAllowed = "move";
                          }
                          setDraggedQueueIndex(vIndex);
                          if (e.clientX !== 0 || e.clientY !== 0) {
                            setQueueDragPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                          setDragOverQueueIndex(vIndex);
                          if (e.clientX !== 0 || e.clientY !== 0) {
                            setQueueDragPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onDragLeave={() => setDragOverQueueIndex(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const rawData = e.dataTransfer.getData("text/plain");
                          const fromVIdx = draggedQueueIndex !== null && draggedQueueIndex !== undefined
                            ? draggedQueueIndex
                            : rawData !== "" ? parseInt(rawData, 10) : NaN;
                          setDraggedQueueIndex(null);
                          setDragOverQueueIndex(null);
                          setQueueDragPos(null);
                          if (!isNaN(fromVIdx) && fromVIdx >= 0 && fromVIdx !== vIndex) {
                            reorderQueue(startIdx + fromVIdx, startIdx + vIndex);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedQueueIndex(null);
                          setDragOverQueueIndex(null);
                          setQueueDragPos(null);
                        }}
                        className={`group flex items-center justify-between rounded-xl p-2 transition duration-150 select-none cursor-pointer ${
                          isDragging
                            ? "opacity-25 scale-[0.98] border-2 border-dashed border-white/30"
                            : isDragOver && !isDragging
                              ? "bg-emerald-500/10 border-2 border-emerald-400 shadow-xl scale-[1.01]"
                              : isCurrent
                                ? "bg-white/10 border border-transparent"
                                : "hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <div 
                          className="flex items-center gap-2 shrink-0 text-white/30 group-hover:text-white/80 transition cursor-grab active:cursor-grabbing p-1.5 -m-1 hover:bg-white/10 rounded-lg"
                          title="Зажмите и потяните для перемещения"
                        >
                          <svg className="h-4 w-4 fill-current pointer-events-none" viewBox="0 0 24 24">
                            <path d="M9 18h6v-2H9v2zm0-5h6v-2H9v2zm0-7v2h6V6H9z" />
                          </svg>
                        </div>
                        <div
                          onClick={() => { playTrack(track, queue); }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer select-none"
                        >
                          <img src={track.cover || "/logo.png"} alt="" draggable={false} className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-sm pointer-events-none" />
                          <div className="min-w-0 flex-1 pointer-events-none select-none">
                            <p className="truncate text-sm font-bold text-white">
                              {track.title}
                            </p>
                            <p className="truncate text-xs font-semibold text-white/40">{track.artist}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                          <TrackMenuButton track={track} />
                          {!isCurrent && removeFromQueue && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromQueue(actualIndex);
                              }}
                              className="p-1 text-white/30 hover:text-red-400 hover:bg-white/10 rounded-full transition"
                              title="Удалить из очереди"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );

                    if (vIndex === 0) {
                      return (
                        <React.Fragment key={`active-${actualIndex}`}>
                          <h4 className="text-[13px] font-bold text-white/50 mb-1 px-1 mt-1">Активно</h4>
                          {itemNode}
                        </React.Fragment>
                      );
                    }
                    if (vIndex === 1) {
                      return (
                        <React.Fragment key={`queue-${actualIndex}`}>
                          <h4 className="text-[13px] font-bold text-white/50 mt-4 mb-1 px-1">Очередь</h4>
                          {itemNode}
                        </React.Fragment>
                      );
                    }
                    return itemNode;
                  });
                })()}
              </div>

              {draggedQueueIndex !== null && queueDragPos && queue[Math.max(0, currentIndex) + draggedQueueIndex] && (
                <div
                  className="fixed z-[9999] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 rounded-2xl bg-[#1c1c1e]/95 border border-white/20 p-2.5 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10 scale-105"
                  style={{ left: queueDragPos.x, top: queueDragPos.y }}
                >
                  <img src={queue[Math.max(0, currentIndex) + draggedQueueIndex].cover || "/logo.png"} alt="" className="h-9 w-9 rounded-lg object-cover shadow-md" />
                  <div className="flex flex-col max-w-[160px]">
                    <span className="text-xs font-bold text-white truncate">{queue[Math.max(0, currentIndex) + draggedQueueIndex].title}</span>
                    <span className="text-[10px] font-medium text-white/60 truncate">{queue[Math.max(0, currentIndex) + draggedQueueIndex].artist}</span>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
      <PlayerIconButton
        icon="/equalizer.svg"
        label="10-Полосный Эквалайзер"
        onClick={() => setIsEqualizerOpen((val) => !val)}
        active={isEqualizerOpen}
      />
      <div
        className="volume-control relative z-[100] grid h-9 w-9 shrink-0 place-items-center"
        onMouseEnter={handleVolumeMouseEnter}
        onMouseLeave={handleVolumeMouseLeave}
      >
        <div
          className={`absolute bottom-12 left-1/2 z-[100] flex w-10 flex-col items-center gap-2.5 -translate-x-1/2 rounded-2xl bg-[#0c0c0e]/95 py-3 shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(.2,.9,.3,1)] ${
            isVolumeOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 translate-y-2 pointer-events-none"
          }`}
          onMouseEnter={handleVolumeMouseEnter}
          onMouseLeave={handleVolumeMouseLeave}
        >
          {/* Arrow Tip */}
          <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#0c0c0e]" />

          {/* Volume Badge */}
          <span className={`text-[10px] font-mono font-bold tabular-nums transition ${
            effectiveVolume > 0 ? "text-white/80" : "text-white/30"
          }`}>
            {effectiveVolume > 0 ? `${volumePercent}%` : "MUTE"}
          </span>

          {/* Track container */}
          <div className="relative flex h-36 w-full items-center justify-center">
            {/* Background Track Line */}
            <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-white/10" />

            {/* Vertical Fill Line */}
            <div
              className="pointer-events-none absolute left-1/2 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              style={{
                height: `${effectiveVolume * 100}%`
              }}
            />

            {/* Visual Thumb Dot (Perfectly centered on vertical line) */}
            <div
              className="pointer-events-none absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-md"
              style={{
                bottom: `calc(${effectiveVolume * 100}% - 7px)`
              }}
            />

            {/* Rotated Input Slider Overlay */}
            <input
              type="range"
              min="0"
              max="100"
              value={volumePercent}
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
              aria-label="Громкость"
              className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 -rotate-90 appearance-none bg-transparent cursor-pointer touch-none focus:outline-none [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0"
            />
          </div>
        </div>

        <button
          type="button"
          aria-label="Громкость"
          onClick={toggleMute}
          className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-95 ${
            isVolumeOpen ? "bg-white/10 opacity-100" : "opacity-60 hover:bg-white/10 hover:opacity-100"
          }`}
        >
          <img src={effectiveVolume > 0 ? "/volume-plus.svg" : "/volume-mute.svg"} alt="" className="h-5 w-5" />
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
  const [isLoading, setIsLoading] = useState(!album?.tracks || album.tracks.length === 0);

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

function MiniKaraoke({ isOpen, onClose, onOpenFull }) {
  const { currentTrack, currentTime, duration, seek, trackPalette } = useAudioPlayer();
  const [lyricsState, setLyricsState] = useState({ status: "idle", lines: [] });
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const lyricRefs = useRef([]);
  const containerRef = useRef(null);

  // Appearance / Disappearance animation state
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 240);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 580 });
  const dragRef = useRef(null);

  const onDragStart = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX - pos.x, startY: e.clientY - pos.y };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 320, ev.clientX - dragRef.current.startX));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - dragRef.current.startY));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  // Reset position when opened
  useEffect(() => {
    if (isOpen) {
      setPos({ x: window.innerWidth - 340, y: window.innerHeight - 580 });
    }
  }, [isOpen]);

  useEffect(() => {
    let isCancelled = false;
    lyricRefs.current = [];
    setLyricsOffset(0);

    if (!currentTrack?.id || currentTrack.id === "empty") {
      setLyricsState({ status: "empty", lines: [] });
      return;
    }
    setLyricsState({ status: "loading", lines: [] });
    getCachedLyricsForTrack(currentTrack, duration).then((result) => {
      if (!isCancelled) {
        setLyricsState(result);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist]);

  const isSynced = lyricsState.status === "synced";
  const lines = isSynced ? lyricsState.lines : [];

  const activeLyricIndex = useMemo(
    () => getActiveLyricIndex(lines, currentTime),
    [currentTime, lines]
  );

  const firstLyricTime = lines[0]?.time;
  const isBeforeFirstLyric = isSynced && Number.isFinite(firstLyricTime) && currentTime + 0.08 < firstLyricTime;

  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef(null);

  const handleWheel = () => {
    isUserScrollingRef.current = true;
    clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2500);
  };

  // Auto-scroll active line to top
  useEffect(() => {
    if (isUserScrollingRef.current) return;

    if (isBeforeFirstLyric && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (activeLyricIndex >= 0) {
      const anchor = lyricRefs.current[activeLyricIndex];
      if (anchor && containerRef.current) {
        containerRef.current.scrollTo({
          top: Math.max(0, anchor.offsetTop - 12),
          behavior: "smooth"
        });
      }
    }
  }, [activeLyricIndex, isBeforeFirstLyric]);

  if (!isRendered) return null;

  const isLoading = lyricsState.status === "loading";
  const noSyncedLyrics = !isLoading && !isSynced;

  return (
    <div
      className="fixed z-50 select-none"
      style={{
        width: "320px",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
        transition: "opacity 240ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: isVisible ? "auto" : "none"
      }}
    >
      <div
        className="flex flex-col rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
        style={{
          backgroundColor: `color-mix(in srgb, ${trackPalette.shadow} 55%, #0e0e0e)`,
          backdropFilter: "blur(24px)",
          boxShadow: "0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,0.04)"
        }}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/[0.06] cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onDragStart}
        >
          <div className="flex items-center gap-2 min-w-0">
            <img src="/lyrics.svg" alt="" className="h-4 w-4 brightness-200 opacity-50 shrink-0" />
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Караоке</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={onOpenFull} title="Открыть полный экран" className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10">
              <svg className="h-3.5 w-3.5 fill-white/40" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
            </button>
            <button type="button" onClick={onClose} title="Закрыть" className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10">
              <svg className="h-3.5 w-3.5 fill-white/40" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
            </button>
          </div>
        </div>

        {/* Lyrics scrollable viewport */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          className="relative overflow-y-auto overflow-x-hidden px-2 py-2 select-text"
          style={{ height: "360px", scrollbarWidth: "none" }}
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          )}
          {noSyncedLyrics && (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <img src="/lyrics.svg" alt="" className="h-8 w-8 brightness-200 opacity-20" />
              <p className="text-[13px] text-white/25 text-center leading-relaxed">Синхронизированный текст<br />не найден для этого трека</p>
            </div>
          )}
          {isSynced && (
            <div className="relative space-y-1 pt-2 pb-24">
              {/* Bouncing dots before first lyric */}
              {isBeforeFirstLyric && (
                <div className="flex items-center gap-1.5 px-3 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              {lines.map((line, index) => {
                const isActive = index === activeLyricIndex;
                const isPast = index < activeLyricIndex;
                return (
                  <p
                    key={`${index}-${line.text}`}
                    ref={(el) => {
                      if (el) lyricRefs.current[index] = el;
                    }}
                    onClick={() => {
                      isUserScrollingRef.current = false;
                      if (Number.isFinite(line.time)) seek(Math.max(0, line.time));
                      if (containerRef.current && lyricRefs.current[index]) {
                        containerRef.current.scrollTo({
                          top: Math.max(0, lyricRefs.current[index].offsetTop - 12),
                          behavior: "smooth"
                        });
                      }
                    }}
                    className={[
                      "cursor-pointer rounded-lg px-3 py-1.5 text-[15px] font-bold transition-all duration-300 leading-snug",
                      isActive ? "text-white scale-[1.02] origin-left" : isPast ? "opacity-30" : "opacity-45 hover:opacity-70"
                    ].join(" ")}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-white/[0.06] bg-black/20">
          <img src={currentTrack?.cover || "/logo.png"} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white/70">{currentTrack?.title}</p>
            <p className="truncate text-[11px] text-white/35">{currentTrack?.artist}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomPlayer({ onOpenFull, onOpenArtist, onOpenAlbum, onToggleKaraoke, isKaraokeOpen }) {
  const { currentTime, duration, progress, seek, trackPalette, next, previous } = useAudioPlayer();
  const [hoverState, setHoverState] = useState({ visible: false, percent: 0, time: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPercent, setScrubPercent] = useState(null);
  const touchStartRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current || !e.changedTouches || e.changedTouches.length === 0) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchStartRef.current.x;
    const deltaY = touchEnd.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (deltaTime > 600) return;

    // Swipe UP opens full player
    if (deltaY < -35 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      onOpenFull?.();
      return;
    }

    // Horizontal swipe switches tracks
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < 0) {
        next();
      } else {
        previous();
      }
    }
  };

  const rawPercent = currentTime > 0 && duration > 0 ? Math.min(100, Math.max(0, Math.round((progress || 0) * 1000) / 10)) : 0;
  const percent = isScrubbing && scrubPercent !== null ? scrubPercent : rawPercent;

  const handleSeekMouseMove = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentX = (x / rect.width) * 100;
    const timeAtX = (x / rect.width) * duration;
    setHoverState({ visible: true, percent: percentX, time: timeAtX });
    if (isScrubbing) {
      setScrubPercent(percentX);
    }
  };

  const handleSeekMouseLeave = () => {
    setHoverState({ visible: false, percent: 0, time: 0 });
    setIsScrubbing(false);
    setScrubPercent(null);
  };

  const handleInputChange = (e) => {
    const val = Number(e.target.value);
    if (duration > 0) {
      setScrubPercent((val / duration) * 100);
    }
    seek(val);
  };

  const handleInputPointerDown = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setIsScrubbing(true);
  };

  const handleInputPointerUp = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setIsScrubbing(false);
    setScrubPercent(null);
  };

  return (
    <div className="group/player relative z-30 w-full select-none">
      {/* Floating timing tooltip on hover */}
      {hoverState.visible && duration > 0 && (
        <div
          className="pointer-events-none absolute -top-8 z-50 -translate-x-1/2 rounded-md bg-[#18181b]/95 px-2 py-0.5 text-[10.5px] font-mono font-semibold text-white shadow-xl border border-white/15 backdrop-blur-md whitespace-nowrap"
          style={{
            left: `${Math.max(4, Math.min(96, hoverState.percent))}%`
          }}
        >
          {formatTime(hoverState.time)} <span className="text-white/40">/</span> {formatTime(duration)}
        </div>
      )}

      {/* Main player box */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 w-full rounded-[var(--player-radius,20px)] max-sm:rounded-xl shadow-2xl max-sm:shadow-none transition-all duration-300"
        style={{
          "--player-accent": `color-mix(in srgb, ${trackPalette.line} 70%, #ffffff)`,
          "--player-accent-muted": `color-mix(in srgb, ${trackPalette.line} 45%, #8a8a8a)`,
          "--player-accent-soft": `color-mix(in srgb, ${trackPalette.line} 20%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${trackPalette.shadow} 45%, #121214)`,
          boxShadow: "0 22px 60px rgba(0,0,0,.55)"
        }}
      >
        {/* Sub-pixel exact inner clipped container (inset 1px inside border, inner radius = outer radius - 1px) */}
        <div className="absolute inset-[1px] overflow-hidden rounded-[calc(var(--player-radius,20px)-1px)] pointer-events-none z-0">
          {/* Dynamic minimal background fill layer */}
          {percent > 0 && (
            <div
              className={`absolute inset-y-0 left-0 ${
                isScrubbing ? "transition-none" : "transition-[width] duration-200 ease-linear"
              }`}
              style={{
                width: `${percent}%`,
                backgroundColor: `color-mix(in srgb, var(--player-accent) 14%, transparent)`
              }}
            />
          )}

          {/* Top integrated progress bar line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] group-hover/player:h-[5px] transition-all duration-200 bg-white/10">
            {percent > 0 && (
              <div
                className={`h-full bg-[var(--player-accent)] ${
                  isScrubbing ? "transition-none" : "transition-[width] duration-200 ease-linear"
                }`}
                style={{ width: `${percent}%` }}
              />
            )}
          </div>
        </div>

        {/* Top interactive hover & seek overlay */}
        <div 
          onMouseMove={handleSeekMouseMove}
          onMouseLeave={handleSeekMouseLeave}
          className="relative z-20 w-full h-[3px] group-hover/player:h-[5px] transition-all duration-200 cursor-pointer pointer-events-auto"
        >
          <input
            type="range"
            min="0"
            max={Math.max(duration || 0, 1)}
            step="0.1"
            value={Math.min(currentTime || 0, duration || 0)}
            onInput={handleInputChange}
            onChange={handleInputChange}
            onMouseDown={handleInputPointerDown}
            onMouseUp={handleInputPointerUp}
            onTouchStart={handleInputPointerDown}
            onTouchEnd={handleInputPointerUp}
            disabled={!duration}
            aria-label="Перемотка трека"
            className="player-seek-slider absolute top-0 bottom-0 left-0 right-0 h-4 z-30 opacity-0 cursor-pointer"
          />
        </div>

        {/* Main player controls row */}
        <div className="relative z-10 flex items-center justify-between gap-4 max-sm:gap-2 px-4 max-sm:px-2.5 py-2.5 max-sm:py-1.5">
          <TrackInfo onOpenFull={onOpenFull} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} />
          <PlayerControls />
          <PlayerTools onOpenFull={onOpenFull} onToggleKaraoke={onToggleKaraoke} isKaraokeOpen={isKaraokeOpen} />
        </div>
      </div>
    </div>
  );
}

export function applyAppearanceSettings(appearance = {}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = appearance.themePreset || "amy";

  root.classList.remove(
    "theme-preset-amy",
    "theme-preset-dotify",
    "theme-preset-cyberpunk",
    "theme-preset-midnight",
    "theme-preset-oled",
    "theme-preset-sunset"
  );
  root.classList.add(`theme-preset-${preset}`);

  const coverRoundingMap = { rounded: "16px", extra: "24px", circle: "9999px" };
  root.style.setProperty("--cover-radius", coverRoundingMap[appearance.coverRounding] || "16px");

  const playerRoundingMap = { sharp: "8px", xl: "16px", pill: "9999px" };
  root.style.setProperty("--player-radius", playerRoundingMap[appearance.playerRounding] || "24px");
}

function WindowControls() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
  
  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!window.__TAURI_INTERNALS__);
    if (typeof window !== "undefined" && window.amyMusicDesktop?.getAppVersion) {
      window.amyMusicDesktop.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  if (!isDesktop) {
    return (
      <div 
        className="absolute left-0 right-0 top-0 h-[36px] bg-transparent z-[9999]" 
        style={{ WebkitAppRegion: "drag" }}
      />
    );
  }

  return (
    <div 
      className="absolute left-0 right-0 top-0 h-[36px] bg-transparent z-[9999] flex items-center justify-between" 
      style={{ WebkitAppRegion: "drag" }}
    >
      <div className="flex h-full items-center pl-3 gap-2 pointer-events-none select-none">
        <img
          src="/logo.png"
          alt="AmyMusic Logo"
          className="h-5 w-5 rounded-md object-cover opacity-90"
        />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-bold tracking-wide text-white/90">AmyMusic</span>
          <span className="text-[10px] font-medium text-white/40">v{appVersion}</span>
        </div>
      </div>

      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" }}>
        <button 
          onClick={() => window.amyMusicDesktop?.minimizeWindow()}
          className="grid h-full w-[46px] place-items-center opacity-40 hover:opacity-100 hover:bg-white/10 transition"
          title="Свернуть"
        >
          <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 10 10"><path d="M1 4.5h8v1H1z"/></svg>
        </button>
        <button 
          onClick={() => window.amyMusicDesktop?.maximizeWindow()}
          className="grid h-full w-[46px] place-items-center opacity-40 hover:opacity-100 hover:bg-white/10 transition"
          title="Развернуть"
        >
          <svg className="w-2.5 h-2.5 fill-transparent stroke-white" strokeWidth="1" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
        </button>
        <button 
          onClick={() => window.amyMusicDesktop?.closeWindow()}
          className="grid h-full w-[46px] place-items-center opacity-40 hover:opacity-100 hover:bg-red-500 transition"
          title="Закрыть"
        >
          <svg className="w-2.5 h-2.5 fill-transparent stroke-white" strokeWidth="1.2" viewBox="0 0 10 10"><path d="M1 1l8 8m0-8L1 9" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { isFullOpen, setIsFullOpen, isEqualizerOpen, setIsEqualizerOpen, contextMenuState, closeContextMenu, openContextMenu } = useAudioPlayer();
  const [activeTab, setActiveTab] = useState("wave");
  const [previousTab, setPreviousTab] = useState("wave");
  const [activeArtist, setActiveArtist] = useState(null);
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [waveRequestId, setWaveRequestId] = useState(0);
  const [apiSettingsVersion, setApiSettingsVersion] = useState(0);
  const [isMiniKaraokeOpen, setIsMiniKaraokeOpen] = useState(false);
  const profileSettings = getProfileSettings();

  const [localProfile, setLocalProfile] = useState(() => ensureLocalProfile());
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [mobileProfileSettings, setMobileProfileSettings] = useState(() => getProfileSettings());
  const currentUser = localProfile.username;
  const profileData = {
    displayName: localProfile.displayName,
    avatarUrl: localProfile.avatarUrl
  };

  const handleProfileSave = async (data) => {
    try {
      const res = await updateProfile(data);
      if (res.success) {
        const next = saveLocalProfile({
          displayName: res.displayName,
          avatarUrl: res.avatarUrl
        });
        setLocalProfile(next);
      }
    } catch (e) {
      console.error("Failed to update profile", e);
    }
  };

  useEffect(() => subscribeLocalProfile(setLocalProfile), []);
  useEffect(() => subscribeProfileSettings(setMobileProfileSettings), []);

  useEffect(() => {
    const openProfile = () => setIsMobileProfileOpen(true);
    window.addEventListener("amymusic:open-profile", openProfile);
    return () => window.removeEventListener("amymusic:open-profile", openProfile);
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

  const renderContent = () => {
    switch (activeTab) {
      case "wave":
        return <HomeView onStartWave={() => {
          setIsFullOpen(true);
        }} onOpenCollection={() => setActiveTab("collection")} onOpenArtist={openArtist} />;
      case "collection":
        return <CollectionView onOpenArtist={openArtist} onOpenAlbum={openAlbum} />;
      case "settings":
        return <SettingsView profileData={profileData} onProfileSave={handleProfileSave} />;
      case "trends": return <TrendsPanel onOpenArtist={openArtist} onOpenAlbum={openAlbum} />;
      case "artist":
        return activeArtist ? (
          <ArtistView
            key={activeArtist.id || activeArtist.permalink || activeArtist.name}
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
            key={activeAlbum.id || activeAlbum.permalink || activeAlbum.title}
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

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <MobileLayout
          activeTab={activeTab}
          setActiveTab={selectTab}
          currentUser={currentUser}
          profileData={profileData}
          onLoginClick={() => {
            selectTab("settings");
          }}
          onOpenProfile={() => {
            selectTab("settings");
          }}
          renderContent={renderContent}
          BottomPlayer={BottomPlayer}
          onOpenFull={() => setIsFullOpen(true)}
          openArtist={openArtist}
          openAlbum={openAlbum}
          activeArtist={activeArtist}
          activeAlbum={activeAlbum}
          onToggleKaraoke={() => setIsMiniKaraokeOpen((v) => !v)}
          isKaraokeOpen={isMiniKaraokeOpen}
          isFullOpen={isFullOpen}
        />
        <MiniKaraoke
          isOpen={isMiniKaraokeOpen}
          onClose={() => setIsMiniKaraokeOpen(false)}
          onOpenFull={() => { setIsMiniKaraokeOpen(false); setIsFullOpen(true); }}
        />
        {isFullOpen && (
          <FullPlayerOverlay
            appearance={profileSettings?.appearance}
            onClose={() => setIsFullOpen(false)}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
          />
        )}
        {isEqualizerOpen && (
          <EqualizerModal onClose={() => setIsEqualizerOpen(false)} />
        )}
        {isMobileProfileOpen && (
          <ProfileSettingsModal
            settings={mobileProfileSettings}
            profileData={profileData}
            onClose={() => setIsMobileProfileOpen(false)}
            onProfileSave={handleProfileSave}
            onSave={async (nextSettings) => {
              const savedSettings = saveProfileSettings(nextSettings);
              setMobileProfileSettings(savedSettings);
            }}
          />
        )}
        <WindowControls />
      </>
    );
  }

  return (
    <main className="relative flex h-screen w-screen select-none gap-4 max-md:gap-0 overflow-hidden bg-black p-3 max-md:p-0 pt-[36px] max-md:pt-0 text-white max-md:flex-col">
      <WindowControls />
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={selectTab}
        currentUser={currentUser}
        profileData={profileData}
        onProfileSave={handleProfileSave}
      />
      <div className="flex min-w-0 min-h-0 flex-1 flex-col justify-between gap-3 max-md:gap-0 max-md:pb-24 max-md:h-full max-md:overflow-hidden">
        <div key={`${activeTab}-${activeArtist?.id || "none"}-${activeAlbum?.id || "noalbum"}-${activeTab === 'settings' ? 'static' : apiSettingsVersion}`} className="contents">
          {renderContent()}
        </div>
        {true && (
          <div className="relative z-40 flex shrink-0 flex-col gap-1 max-md:fixed max-md:bottom-14 max-md:left-2 max-md:right-2">
            <BottomPlayer
              onOpenFull={() => setIsFullOpen(true)}
              onOpenArtist={openArtist}
              onOpenAlbum={openAlbum}
              onToggleKaraoke={() => setIsMiniKaraokeOpen((v) => !v)}
              isKaraokeOpen={isMiniKaraokeOpen}
            />
            <p className="self-end pr-1 text-[10px] text-neutral-600 max-md:hidden">Copyright © 2026 AmyMusic. Все права НЕ защищены.</p>
          </div>
        )}
      </div>
      <MiniKaraoke
        isOpen={isMiniKaraokeOpen}
        onClose={() => setIsMiniKaraokeOpen(false)}
        onOpenFull={() => { setIsMiniKaraokeOpen(false); setIsFullOpen(true); }}
      />
      {isFullOpen && (
        <FullPlayerOverlay
          appearance={profileSettings?.appearance}
          onClose={() => setIsFullOpen(false)}
          onOpenArtist={openArtist}
          onOpenAlbum={openAlbum}
        />
      )}
      {isEqualizerOpen && (
        <EqualizerModal onClose={() => setIsEqualizerOpen(false)} />
      )}
      {contextMenuState && (
        <TrackContextMenu
          track={contextMenuState.track}
          x={contextMenuState.x}
          y={contextMenuState.y}
          onClose={closeContextMenu}
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

initNativeShell().catch((error) => {
  console.warn("[AmyMusic:native]", error);
});

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <AudioProvider>
      <App />
    </AudioProvider>
  </AppErrorBoundary>
);

