import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Component } from "react";
import { WaveView } from "./components/WaveView";
import { CollectionView } from "./components/CollectionView";
import { ArtistView } from "./components/ArtistView";
import { FullPlayerOverlay } from "./components/FullPlayerOverlay";
import { AudioProvider, useAudioPlayer } from "./audio/AudioPlayerContext";
import { TrackMenuButton } from "./components/TrackContextMenu";
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
  { id: "trends", label: "Для вас и Тренды", icon: "/trends.svg" },
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
        <div className="leading-tight drop-shadow-[0_0_8px_rgba(158,125,255,0.4)] whitespace-nowrap">
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

function ProfileSettingsModal({ settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  };

  useEscapeKey(true, handleClose);

  const updateField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave(draft);
  };

  const fileInputRef = React.useRef(null);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        updateField("avatarUrl", result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/70 p-10 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className={`flex w-full max-w-4xl flex-col overflow-hidden rounded-[17.76px] border border-white/[0.04] bg-[#090909] text-white shadow-2xl ${isClosing ? "animate-[slideDownFade_0.25s_ease-in_forwards]" : "animate-slide-up-fade"}`}
        style={{ maxHeight: "calc(100vh - 80px)" }}
      >
        <div className="relative min-h-[330px] shrink-0 overflow-hidden border-b border-white/[0.05] px-10 pb-10 pt-8">
          <div className="absolute inset-0 opacity-45 blur-3xl">
            <div className="h-full w-full bg-[#8341EF]" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/78 to-[#090909]" />

          <div className="relative z-10 flex h-full flex-col justify-between">
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-8 top-8 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
              aria-label="Закрыть"
            >
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
            </button>

            <div className="flex items-end gap-7">
              <div className="group relative flex h-52 w-52 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.02] object-cover shadow-2xl transition hover:border-white/20" onClick={() => fileInputRef.current?.click()}>
                 {draft.avatarUrl ? (
                   <img src={draft.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                 ) : (
                   <img src="/user.svg" alt="" className="h-20 w-20 opacity-30" />
                 )}
                 <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                   <span className="text-xs font-bold text-white">Изменить фото</span>
                 </div>
                 <input
                   type="file"
                   accept="image/*"
                   className="hidden"
                   ref={fileInputRef}
                   onChange={handleAvatarChange}
                 />
              </div>
              <div className="max-w-4xl pb-2">
                <h1 className="text-5xl font-black tracking-tight text-white">{draft.displayName || "Local Profile"}</h1>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-white/45">
                  <span>Локальные настройки</span>
                  <span>AmyMusic</span>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="submit" className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85">
                    Сохранить изменения
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({
                      displayName: "Local profile",
                      avatarUrl: "",
                      soundCloudClientId: "",
                      soundCloudClientSecret: "",
                      soundCloudHttpProxies: "",
                      appLaunchOnStartup: false,
                      appMinimizeToTray: false,
                      crossfadeEnabled: false,
                      crossfadeSeconds: 4
                    })}
                    className="rounded-full bg-white/8 px-4 py-2.5 text-sm font-bold text-white/45 transition hover:bg-white/10 hover:text-white"
                  >
                    Сбросить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto p-10">
          <section>
            <h3 className="mb-4 text-lg font-black text-white">Основные настройки</h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.04]">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-white/30">Отображаемое имя</span>
                <input
                  value={draft.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/20"
                  placeholder="Local profile"
                />
              </label>

              <label className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.04]">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-white/30">Client ID</span>
                <input
                  value={draft.soundCloudClientId}
                  onChange={(event) => updateField("soundCloudClientId", event.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-white outline-none placeholder:text-white/20"
                  placeholder="client_id"
                  spellCheck={false}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-black text-white">Система</h3>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <div>
                  <span className="block text-sm font-black text-white">Автозапуск</span>
                  <span className="block text-xs font-semibold text-white/40">Запускать AmyMusic вместе с Windows</span>
                </div>
                <div className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${draft.appLaunchOnStartup ? "bg-[#8341EF]" : "bg-white/10"}`}>
                  <div className={`absolute bottom-1 left-1 top-1 w-4 rounded-full bg-white transition-transform duration-300 ${draft.appLaunchOnStartup ? "translate-x-5" : "translate-x-0"}`} />
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(draft.appLaunchOnStartup)}
                  onChange={(event) => updateField("appLaunchOnStartup", event.target.checked)}
                  className="hidden"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <div>
                  <span className="block text-sm font-black text-white">Трей</span>
                  <span className="block text-xs font-semibold text-white/40">Сворачивать и закрывать окно в системный трей</span>
                </div>
                <div className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${draft.appMinimizeToTray ? "bg-[#8341EF]" : "bg-white/10"}`}>
                  <div className={`absolute bottom-1 left-1 top-1 w-4 rounded-full bg-white transition-transform duration-300 ${draft.appMinimizeToTray ? "translate-x-5" : "translate-x-0"}`} />
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(draft.appMinimizeToTray)}
                  onChange={(event) => updateField("appMinimizeToTray", event.target.checked)}
                  className="hidden"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <div>
                  <span className="block text-sm font-black text-white">Кросфейд</span>
                  <span className="block text-xs font-semibold text-white/40">Плавное затухание и вход между треками</span>
                </div>
                <div className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${draft.crossfadeEnabled ? "bg-[#8341EF]" : "bg-white/10"}`}>
                  <div className={`absolute bottom-1 left-1 top-1 w-4 rounded-full bg-white transition-transform duration-300 ${draft.crossfadeEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(draft.crossfadeEnabled)}
                  onChange={(event) => updateField("crossfadeEnabled", event.target.checked)}
                  className="hidden"
                />
              </label>

              {draft.crossfadeEnabled && (
                <label className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-bold text-white/40">
                    <span>Длительность кросфейда</span>
                    <span className="text-white">{draft.crossfadeSeconds || 4} сек</span>
                  </div>
                  <div className="player-seek-wrap relative h-4 w-full">
                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-[#8341EF]" style={{ width: `${((draft.crossfadeSeconds || 4) / 12) * 100}%` }} />
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
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-lg font-black text-white">Продвинутые настройки</h3>
            <div className="grid grid-cols-1 gap-4">
              <label className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.04]">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-white/30">Client Secret</span>
                <input
                  value={draft.soundCloudClientSecret}
                  onChange={(event) => updateField("soundCloudClientSecret", event.target.value)}
                  type="password"
                  className="w-full bg-transparent font-mono text-xs font-bold text-white outline-none placeholder:text-white/20"
                  placeholder="Опционально"
                  spellCheck={false}
                />
              </label>

              <label className="block rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.04]">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-white/30">HTTP Proxy (по одному на строку)</span>
                <textarea
                  value={draft.soundCloudHttpProxies}
                  onChange={(event) => updateField("soundCloudHttpProxies", event.target.value)}
                  className="h-24 w-full resize-none bg-transparent font-mono text-xs font-bold text-white outline-none placeholder:text-white/20"
                  placeholder={"45.141.185.15:5882\n163.5.189.210:3888"}
                  spellCheck={false}
                />
              </label>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function Sidebar({ activeTab, setActiveTab }) {
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

    window.amyMusicDesktop?.setTrayEnabled?.(settings.appMinimizeToTray).catch(() => { });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOpenProfile = () => setIsProfileOpen(true);
    window.addEventListener("amymusic:open-profile", handleOpenProfile);
    return () => window.removeEventListener("amymusic:open-profile", handleOpenProfile);
  }, []);

  const proxyCount = settings.soundCloudHttpProxies
    ? settings.soundCloudHttpProxies.split(",").filter(Boolean).length
    : 0;

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

      <div className="mb-4 w-full space-y-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("amymusic:open-profile"))}
          className="group flex w-full items-center gap-3.5 rounded-full py-2.5 px-[18px] text-left text-sm transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] text-white/50 hover:text-white/80 overflow-hidden"
          title={isCollapsed ? (settings.displayName || "Local profile") : undefined}
        >
          <img src={settings.avatarUrl || "/user.svg"} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover opacity-85 transition group-hover:opacity-100" />
          <span className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"}`}>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="block truncate font-medium text-inherit max-w-[70px]">
                {settings.displayName || "Local profile"}
              </span>
              {totalListenedSeconds >= 60 && (
                <>
                  <span className="text-[10px] opacity-40">•</span>
                  <span className="text-[11px] font-semibold opacity-60">{timeString}</span>
                </>
              )}
            </span>
          </span>
        </button>
      </div>

      {isProfileOpen && (
        <ProfileSettingsModal
          settings={settings}
          onClose={() => setIsProfileOpen(false)}
          onSave={async (nextSettings) => {
            const savedSettings = saveProfileSettings(nextSettings);
            await Promise.allSettled([
              window.amyMusicDesktop?.setAutoLaunch?.(savedSettings.appLaunchOnStartup),
              window.amyMusicDesktop?.setTrayEnabled?.(savedSettings.appMinimizeToTray)
            ]);
            setSettings(savedSettings);
            setIsProfileOpen(false);
          }}
        />
      )}
    </aside>
  );
}

function formatFollowers(count) {
  if (!count) return "SoundCloud";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M подписчиков`;
  if (count >= 1_000) return `${Math.round(count / 100) / 10}K подписчиков`;
  return `${count} подписчиков`;
}

function ArtistCard({ artist, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(artist)}
      className="group flex w-36 shrink-0 flex-col items-center rounded-2xl p-3 text-center transition hover:bg-white/[0.04]"
    >
      <div className="relative h-28 w-28 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] shadow-xl">
        <img src={artist.avatar} alt={artist.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
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
      avatar: track.artistAvatar || track.cover || "/logo.png",
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
                avatar: artist.avatar || track.artistAvatar || track.cover || "/logo.png",
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
  const { playHistory, likedTracks, dislikedTrackIds, dislikedTracks, playTrack, savedReleaseIds, toggleSavedRelease } = useAudioPlayer();
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
  const [trackWaveLoading, setTrackWaveLoading] = useState(false);

  const openTrackWave = async (track) => {
    if (trackWaveLoading) return;
    setTrackWaveLoading(true);
    try {
      const waveTracks = await getTrackWaveTracks(track, { likedTracks, dislikedTrackIds, dislikedTracks });
      if (waveTracks.length) await playTrack(track, [track, ...waveTracks]);
    } catch (e) { /* silent */ } finally { setTrackWaveLoading(false); }
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

function TrendsPanel({ onOpenArtist }) {
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
        let results = await getPersonalWaveTracks({
          likedTracks,
          dislikedTrackIds,
          dislikedTracks,
          playHistory,
          currentTrack
        });

        if (!results.length) {
          results = await getRecommendedTracks();
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
          <h2 className="text-2xl font-black tracking-tight text-white">Для вас и Тренды</h2>
          <p className="mt-1 text-sm font-semibold text-white/35">Подборка строится по лайкам, истории, жанрам и дизлайкам.</p>
        </div>
        <span className="text-xs font-semibold text-white/30">
          {isLoading ? "загрузка" : `${tracks.length} треков`}
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {(() => {
        const leftTracks = [];
        const rightTracks = [];
        tracks.forEach((track, index) => {
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
            <button type="button" onClick={() => playTrack(track, tracks)} className="h-11 w-11 shrink-0">
              <img src={track.cover} alt="" className="h-11 w-11 rounded-lg object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => playTrack(track, tracks)}
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
                />
              </div>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
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

function TrackInfo({ onOpenFull, onOpenArtist }) {
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
  const { controls, isPlaying, trackPalette } = useAudioPlayer();

  return (
    <div className="flex items-center justify-center gap-4">
      {controls.map((control) =>
        control.primary ? (
          <button
            key={control.id}
            type="button"
            onClick={control.action}
            aria-label={control.label}
            title={control.label}
            className="grid shrink-0 place-items-center transition hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
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
  const { currentTrack, effectiveVolume, playTrack, queue, reorderQueue, setVolume } = useAudioPlayer();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);
  const [equalizer, setEqualizer] = useState({
    bass: 52,
    mids: 50,
    treble: 56
  });
  const volumePercent = Math.round(effectiveVolume * 100);

  useEscapeKey(isQueueOpen || isEqualizerOpen, () => {
    setIsQueueOpen(false);
    setIsEqualizerOpen(false);
  });

  const profileSettings = getProfileSettings();

  return (
    <div className="flex w-auto items-center justify-end gap-2">
      <PlayerIconButton icon="/lyrics.svg" label="Текст песни" onClick={onOpenFull} />
      <div className="relative">
        <PlayerIconButton
          icon="/queue.svg"
          label="Очередь"
          onClick={() => {
            setIsQueueOpen((value) => !value);
            setIsEqualizerOpen(false);
          }}
          active={isQueueOpen}
        />
        {isQueueOpen && (
          <div className="absolute bottom-11 right-0 z-40 w-80 rounded-2xl border border-white/10 bg-[#171717]/95 p-3 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-white/80">Очередь</p>
              <span className="text-[10px] font-semibold text-white/35">{queue.length} треков</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
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
                        if (draggedQueueIndex !== null && draggedQueueIndex !== index) {
                          reorderQueue(draggedQueueIndex, index);
                        }
                        setDraggedQueueIndex(null);
                        setDragOverQueueIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedQueueIndex(null);
                        setDragOverQueueIndex(null);
                      }}
                      onClick={() => playTrack(track, queue)}
                      className={[
                        "flex w-full items-center gap-2 rounded-xl p-2 text-left transition cursor-grab active:cursor-grabbing",
                        isCurrent ? "bg-white/10" : "hover:bg-white/5",
                        isDragging ? "opacity-30 scale-95" : "opacity-100",
                        isDragOver ? "border-2 border-[#8341EF]" : "border border-transparent"
                      ].join(" ")}
                    >
                      <svg className="h-3.5 w-3.5 shrink-0 fill-white/20 hover:fill-white/60 transition" viewBox="0 0 24 24">
                        <path d="M9 18h6v-2H9v2zm0-5h6v-2H9v2zm0-7v2h6V6H9z" />
                      </svg>
                      <img src={track.cover} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{track.title}</p>
                        <p className="truncate text-[11px] text-white/40">{track.artist}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      <div className="relative">
        <PlayerIconButton
          icon="/equalizer.svg"
          label="Эквалайзер"
          onClick={() => {
            setIsEqualizerOpen((value) => !value);
            setIsQueueOpen(false);
          }}
          active={isEqualizerOpen}
        />
        {isEqualizerOpen && (
          <div className="absolute bottom-11 right-0 z-40 w-56 rounded-2xl border border-white/10 bg-[#171717]/95 p-4 shadow-2xl backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-white/80">Эквалайзер</p>
              <button
                type="button"
                onClick={() => setEqualizer({ bass: 50, mids: 50, treble: 50 })}
                className="text-[10px] font-semibold text-white/35 transition hover:text-white/70"
              >
                reset
              </button>
            </div>
            {Object.entries(equalizer).map(([band, value]) => (
              <label key={band} className="mb-3 block last:mb-0">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-white/45">
                  <span>{band}</span>
                  <span>{value}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={value}
                  onChange={(event) =>
                    setEqualizer((next) => ({ ...next, [band]: Number(event.target.value) }))
                  }
                  className="w-full accent-[var(--player-accent)]"
                />
              </label>
            ))}
          </div>
        )}
      </div>
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

function BottomPlayer({ onOpenFull, onOpenArtist }) {
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
        <TrackInfo onOpenFull={onOpenFull} onOpenArtist={onOpenArtist} />
        <PlayerControls />
        <PlayerTools onOpenFull={onOpenFull} />
      </div>
      <PlayerSeekBar />
    </div>
  );
}

export default function App() {
  const { isFullOpen, setIsFullOpen } = useAudioPlayer();
  const [activeTab, setActiveTab] = useState("wave");
  const [activeArtist, setActiveArtist] = useState(null);
  const [waveRequestId, setWaveRequestId] = useState(0);
  const [apiSettingsVersion, setApiSettingsVersion] = useState(0);

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
    setActiveArtist(artist);
    setActiveTab("artist");
  };

  const closeArtist = () => {
    setActiveArtist(null);
    setActiveTab("wave");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "wave": return <WaveView requestId={waveRequestId} onOpenFull={() => setIsFullOpen(true)} />;
      case "collection": return <CollectionView onOpenArtist={openArtist} />;
      case "trends": return <TrendsPanel onOpenArtist={openArtist} />;
      case "artist":
        return activeArtist ? (
          <ArtistView
            artist={activeArtist}
            onBack={closeArtist}
            onOpenArtist={openArtist}
          />
        ) : (
          <SearchPanel onOpenArtist={openArtist} />
        );
      case "search": default: return <SearchPanel onOpenArtist={openArtist} />;
    }
  };

  return (
    <main className="relative flex h-screen w-screen select-none gap-4 overflow-hidden bg-black p-3 pt-[36px] text-white">
      {/* Draggable Title Bar Overlay */}
      <div 
        className="absolute left-0 right-0 top-0 h-[36px] bg-transparent" 
        style={{ WebkitAppRegion: "drag" }}
      />
      <Sidebar activeTab={activeTab} setActiveTab={selectTab} />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div key={`${activeTab}-${activeArtist?.id || "none"}-${apiSettingsVersion}`} className="contents">
          {renderContent()}
        </div>
        {activeTab !== "wave" && (
          <div className="flex shrink-0 flex-col gap-1">
            <BottomPlayer onOpenFull={() => setIsFullOpen(true)} onOpenArtist={openArtist} />
            <p className="self-end pr-1 text-[10px] text-neutral-600">Copyright © 2026 AmyMusic. Все права НЕ защищены.</p>
          </div>
        )}
      </div>
      {isFullOpen && (
        <FullPlayerOverlay
          onClose={() => setIsFullOpen(false)}
          onOpenArtist={openArtist}
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

