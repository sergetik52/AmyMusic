import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";
import { getCachedLyricsForTrack, getActiveLyricIndex } from "../../services/lyricsApi";
import { fetchYandexArtistAvatar, getYandexCachedArtistAvatar } from "../../services/yandexMusicApi";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function MobileFullPlayer({ isOpen, onClose, onOpenArtist, onOpenAlbum, onOpenEqualizer }) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackQueue,
    currentQueueIndex,
    isShuffle,
    repeatMode,
    togglePlay,
    seekTo,
    playNextTrack,
    playPreviousTrack,
    toggleShuffle,
    cycleRepeatMode,
    likedTrackIds,
    toggleLike,
    isDisliked,
    toggleDislike,
    playQueueTrack,
    clearQueue,
    removeFromQueue,
    audio
  } = useAudioPlayer();

  const [activeTab, setActiveTab] = useState("player"); // "player" | "lyrics" | "queue"
  const [lyricsState, setLyricsState] = useState({ status: "idle", lines: [], error: "" });
  const [startY, setStartY] = useState(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const [yandexArtistAvatar, setYandexArtistAvatar] = useState("");

  const lyricsContainerRef = useRef(null);
  const activeLyricRef = useRef(null);

  // Load lyrics when currentTrack changes
  useEffect(() => {
    if (!currentTrack || !currentTrack.id || currentTrack.id === "empty") {
      setLyricsState({ status: "empty", lines: [], error: "" });
      return;
    }
    let isMounted = true;
    setLyricsState({ status: "loading", lines: [], error: "" });

    getCachedLyricsForTrack(currentTrack, duration)
      .then((data) => {
        if (!isMounted) return;
        if (data?.lines?.length) {
          setLyricsState({ status: "success", lines: data.lines, error: "" });
        } else {
          setLyricsState({ status: "empty", lines: [], error: "Текст песни не найден" });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setLyricsState({ status: "error", lines: [], error: "Не удалось загрузить текст" });
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.duration, duration]);

  // Load artist Yandex avatar
  useEffect(() => {
    const artistName = currentTrack?.artist || "";
    if (!artistName) return;
    const cached = getYandexCachedArtistAvatar(artistName);
    if (cached) {
      setYandexArtistAvatar(cached);
    } else {
      fetchYandexArtistAvatar(artistName).then((url) => {
        if (url) setYandexArtistAvatar(url);
      });
    }
  }, [currentTrack?.artist]);

  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);

  // Active lyric index with requestAnimationFrame
  useEffect(() => {
    if (!audio || !lyricsState.lines || lyricsState.lines.length === 0) {
      setActiveLyricIndex(-1);
      return;
    }
    
    let rafId;
    const updateLyrics = () => {
      const now = audio.currentTime || 0;
      const idx = getActiveLyricIndex(lyricsState.lines, now);
      
      setActiveLyricIndex(prev => prev !== idx ? idx : prev);
      
      rafId = requestAnimationFrame(updateLyrics);
    };
    
    rafId = requestAnimationFrame(updateLyrics);
    return () => cancelAnimationFrame(rafId);
  }, [audio, lyricsState.lines]);

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeTab === "lyrics" && activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [activeLyricIndex, activeTab]);

  // Lock body scroll when full player is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setActiveTab("player");
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !currentTrack) return null;

  const isLiked = likedTrackIds.has(currentTrack.id);
  const isTrackDisliked = isDisliked?.(currentTrack.id);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Touch handlers for swipe down to dismiss
  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    if (startY === null) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 0) {
      setCurrentTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (currentTranslateY > 120) {
      onClose();
    }
    setCurrentTranslateY(0);
    setStartY(null);
  };

  return (
    <div 
      className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/80 backdrop-blur-2xl transition-transform duration-200"
      style={{
        transform: `translateY(${currentTranslateY}px)`
      }}
    >
      {/* Background artwork glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-35 blur-3xl">
        <img
          src={currentTrack.cover || "/logo.png"}
          alt=""
          className="h-full w-full object-cover scale-150"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-[#0c0c0e]" />

      <div 
        className="relative z-10 flex h-full w-full flex-col ios-safe-top ios-safe-bottom px-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar with drag handle and mode switch */}
        <div className="flex flex-col items-center pt-2">
          <div className="h-1.5 w-12 rounded-full bg-white/25 mb-3" />
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 active:scale-95"
              aria-label="Свернуть"
            >
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
            </button>

            {/* Segmented Mode Control */}
            <div className="flex items-center rounded-full bg-white/10 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab("player")}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
                  activeTab === "player" ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
                }`}
              >
                Плеер
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("lyrics")}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
                  activeTab === "lyrics" ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
                }`}
              >
                Текст
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("queue")}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
                  activeTab === "queue" ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
                }`}
              >
                Очередь
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenEqualizer}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 active:scale-95"
              aria-label="Эквалайзер"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
            </button>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="flex-1 overflow-hidden my-auto flex flex-col justify-center">
          {/* 1. PLAYER TAB */}
          {activeTab === "player" && (
            <div className="flex flex-col items-center justify-center h-full animate-fade-in">
              {/* Artwork with fluid scale */}
              <div className="relative my-auto aspect-square w-full max-w-[310px] max-h-[310px] overflow-hidden rounded-[26px] border border-white/10 shadow-2xl transition-all duration-500 ease-out">
                <img
                  src={currentTrack.cover || "/logo.png"}
                  alt={currentTrack.title}
                  className={`h-full w-full object-cover transition-all duration-500 ${
                    isPlaying ? "cover-playing" : "cover-paused"
                  }`}
                />
              </div>

              {/* Title & Artist & Like */}
              <div className="mt-4 flex w-full items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <h1 className="truncate text-xl font-black text-white">{currentTrack.title}</h1>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenArtist?.({
                        id: currentTrack.artistId || "",
                        name: currentTrack.artist,
                        username: currentTrack.artist,
                        avatar: currentTrack.artistAvatar || currentTrack.cover || "/user.svg"
                      });
                    }}
                    className="mt-1 inline-flex items-center gap-2 truncate text-sm font-semibold text-white/60 hover:text-white"
                  >
                    {yandexArtistAvatar && (
                      <img
                        src={yandexArtistAvatar}
                        alt=""
                        className="h-4 w-4 rounded-full object-cover ring-1 ring-white/20"
                      />
                    )}
                    <span className="truncate">{currentTrack.artist}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack.id, currentTrack)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 active:scale-90"
                    aria-label="Лайк"
                  >
                    <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Scrubber Timeline */}
              <div className="mt-5 w-full">
                <div className="relative flex h-6 w-full items-center">
                  <input
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={currentTime || 0}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-white/20 accent-white cursor-pointer"
                  />
                </div>
                <div className="flex justify-between text-xs font-semibold text-white/40">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Main Playback Controls */}
              <div className="mt-4 flex w-full items-center justify-between px-2">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 ${
                    isShuffle ? "text-white bg-white/20" : "text-white/40 hover:text-white"
                  }`}
                  aria-label="Перемешать"
                >
                  <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
                </button>

                <button
                  type="button"
                  onClick={playPreviousTrack}
                  className="flex h-13 w-13 items-center justify-center rounded-full text-white active:scale-90"
                  aria-label="Предыдущий трек"
                >
                  <svg className="h-9 w-9 fill-current" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                </button>

                {/* Big Play/Pause Button */}
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-18 w-18 items-center justify-center rounded-full bg-white text-black shadow-xl active:scale-95 transition"
                  aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
                >
                  {isPlaying ? (
                    <svg className="h-9 w-9 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                  ) : (
                    <svg className="h-9 w-9 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>

                <button
                  type="button"
                  onClick={playNextTrack}
                  className="flex h-13 w-13 items-center justify-center rounded-full text-white active:scale-90"
                  aria-label="Следующий трек"
                >
                  <svg className="h-9 w-9 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>

                <button
                  type="button"
                  onClick={cycleRepeatMode}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 ${
                    repeatMode !== "off" ? "text-white bg-white/20" : "text-white/40 hover:text-white"
                  }`}
                  aria-label="Повтор"
                >
                  {repeatMode === "one" ? (
                    <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" /></svg>
                  ) : (
                    <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 2. LYRICS TAB */}
          {activeTab === "lyrics" && (
            <div 
              ref={lyricsContainerRef}
              className="h-full overflow-y-auto mobile-scroll-container py-12 px-2 text-center animate-fade-in"
            >
              {lyricsState.status === "loading" && (
                <div className="flex h-full items-center justify-center text-sm font-bold text-white/50">
                  Загрузка текста...
                </div>
              )}

              {lyricsState.status === "error" || lyricsState.status === "empty" ? (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-white/40">
                  {lyricsState.error || "Текст песни недоступен"}
                </div>
              ) : null}

              {lyricsState.lines.map((line, idx) => {
                const isActive = idx === activeLyricIndex;
                const isPassed = activeLyricIndex !== -1 && idx < activeLyricIndex;

                return (
                  <p
                    key={`${line.time}-${idx}`}
                    ref={isActive ? activeLyricRef : null}
                    onClick={() => seekTo(line.time)}
                    className={`my-6 cursor-pointer text-xl font-bold transition-all duration-150 leading-relaxed ${
                      isActive
                        ? "text-white scale-105 opacity-100 drop-shadow-md"
                        : isPassed
                        ? "text-white/40 scale-100 opacity-60"
                        : "text-white/25 scale-95 opacity-30"
                    }`}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}

          {/* 3. QUEUE TAB */}
          {activeTab === "queue" && (
            <div className="h-full flex flex-col overflow-hidden animate-fade-in pt-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-sm font-bold text-white/70">
                  В очереди ({playbackQueue.length} треков)
                </span>
                <button
                  type="button"
                  onClick={clearQueue}
                  className="text-xs font-semibold text-red-400 active:opacity-70"
                >
                  Очистить
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mobile-scroll-container py-2 space-y-1">
                {playbackQueue.map((track, idx) => {
                  const isCurrent = idx === currentQueueIndex;
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      onClick={() => playQueueTrack(idx)}
                      className={`flex items-center gap-3.5 rounded-2xl p-2.5 transition active:bg-white/10 ${
                        isCurrent ? "bg-white/15 border border-white/10" : ""
                      }`}
                    >
                      <img
                        src={track.cover || "/logo.png"}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-bold ${isCurrent ? "text-white" : "text-white/80"}`}>
                          {track.title}
                        </p>
                        <p className="truncate text-xs font-medium text-white/45">{track.artist}</p>
                      </div>

                      {isCurrent ? (
                        <span className="text-xs font-bold text-[var(--player-accent,#a855f7)]">Сейчас</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(idx);
                          }}
                          className="flex h-8 w-8 items-center justify-center text-white/40 hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
