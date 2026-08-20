import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { fetchLyricsForTrack } from "../services/lyricsApi";
import { useEscapeKey } from "../utils/useEscapeKey";
import { TrackContextMenu, TrackMenuButton } from "./TrackContextMenu";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function getActiveLyricIndex(lines, currentTime) {
  if (!lines.length) return -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(lines[index].time) && currentTime + 0.08 >= lines[index].time) {
      return index;
    }
  }

  return -1;
}

const lyricsRequestCache = new Map();

function getLyricsCacheKey(track, duration) {
  return [
    track?.id || "",
    track?.title || "",
    track?.artist || "",
    Math.round(track?.duration || duration || 0)
  ].join("|");
}

function getCachedLyricsForTrack(track, duration) {
  const key = getLyricsCacheKey(track, duration);
  if (lyricsRequestCache.has(key)) {
    return lyricsRequestCache.get(key);
  }

  const request = fetchLyricsForTrack({
    ...track,
    duration: track.duration || duration
  })
    .then((lyrics) => ({
      status: lyrics.status,
      lines: lyrics.lines || [],
      error: ""
    }))
    .catch((error) => ({
      status: "error",
      lines: [],
      error: error.message || "Не удалось загрузить текст"
    }));

  lyricsRequestCache.set(key, request);
  return request;
}

function splitArtistNames(value = "") {
  if (!value) return [];
  const parts = String(value).split(/\s*(?:,|&|\/|\+|\b[xX]\b|×|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|;)\s*/i);
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

export function FullPlayerOverlay({ onClose, onOpenArtist, onOpenAlbum }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [sidePanel, setSidePanel] = useState("lyrics");
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [lyricsState, setLyricsState] = useState({
    status: "idle",
    lines: [],
    error: ""
  });
  const lyricsStageRef = useRef(null);
  const lyricRefs = useRef([]);
  const lyricWheelLockRef = useRef(false);
  const {
    currentTrack,
    trackPalette,
    isPlaying,
    isLiked,
    currentTime,
    duration,
    progress,
    queue,
    currentIndex,
    repeatMode,
    isShuffle,
    toggleShuffle,
    togglePlay,
    previous,
    next,
    playTrack,
    toggleLike,
    cycleRepeatMode,
    seek,
    reorderQueue,
    removeFromQueue
  } = useAudioPlayer();

  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);
  const [queueContextMenu, setQueueContextMenu] = useState(null);

  const activeLyricIndex = useMemo(
    () => getActiveLyricIndex(lyricsState.lines, currentTime),
    [currentTime, lyricsState.lines]
  );
  const firstLyricTime = lyricsState.lines[0]?.time;
  const isBeforeFirstLyric =
    Number.isFinite(firstLyricTime) && currentTime + 0.08 < firstLyricTime;
  const lyricsAnchorIndex = isBeforeFirstLyric ? -1 : activeLyricIndex;
  const shouldShowLyricsPanel =
    sidePanel === "lyrics" && showLyrics && (lyricsState.status === "loading" || lyricsState.lines.length > 0);
  const shouldShowQueuePanel = sidePanel === "queue";
  const shouldShowSidePanel = shouldShowLyricsPanel || shouldShowQueuePanel;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    lyricRefs.current = [];
    setLyricsOffset(0);

    if (!currentTrack?.id || currentTrack.id === "empty") {
      setLyricsState({ status: "empty", lines: [], error: "" });
      return undefined;
    }

    setLyricsState({ status: "loading", lines: [], error: "" });

    getCachedLyricsForTrack(currentTrack, duration)
      .then((nextLyricsState) => {
        if (!isCancelled) {
          setLyricsState(nextLyricsState);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.duration, duration]);

  useLayoutEffect(() => {
    if (!shouldShowLyricsPanel || lyricsAnchorIndex < -1) {
      setLyricsOffset(0);
      return;
    }

    const stage = lyricsStageRef.current;
    const anchor = lyricRefs.current[lyricsAnchorIndex];
    if (!stage || !anchor) return;

    const nextOffset =
      stage.clientHeight / 2 -
      anchor.offsetTop -
      anchor.offsetHeight / 2;

    setLyricsOffset(nextOffset);
  }, [lyricsAnchorIndex, lyricsState.lines, shouldShowLyricsPanel]);

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const handleArtistClick = (artist) => {
    onOpenArtist?.({
      id: artist.id || "",
      name: artist.name || artist.username,
      username: artist.username || artist.name,
      avatar: artist.avatar || currentTrack.artistAvatar || currentTrack.cover || "/logo.png",
      permalinkUrl: artist.permalinkUrl || "",
      followers: 0,
      followings: 0,
      trackCount: 0,
      city: "",
      country: "",
      tags: []
    });
    handleClose();
  };

  const primaryArtist = getTrackArtists(currentTrack)[0];

  useEscapeKey(true, () => {
    if (isMoreOpen) {
      setIsMoreOpen(false);
      return;
    }

    handleClose();
  });

  const seekToLyric = (line, index = activeLyricIndex) => {
    if (!Number.isFinite(line?.time)) return;
    seek(Math.max(0, line.time));

    const stage = lyricsStageRef.current;
    const anchor = lyricRefs.current[index];
    if (stage && anchor) {
      setLyricsOffset(stage.clientHeight / 2 - anchor.offsetTop - anchor.offsetHeight / 2);
    }
  };

  const handleLyricsWheel = (event) => {
    if (!lyricsState.lines.length || lyricWheelLockRef.current) return;
    event.preventDefault();

    const direction = event.deltaY > 0 ? 1 : -1;
    const currentIndex = activeLyricIndex >= 0 ? activeLyricIndex : 0;
    const nextIndex = Math.min(
      lyricsState.lines.length - 1,
      Math.max(0, currentIndex + direction)
    );
    const nextLine = lyricsState.lines[nextIndex];
    if (!nextLine || nextIndex === activeLyricIndex) return;

    lyricWheelLockRef.current = true;
    seekToLyric(nextLine, nextIndex);
    window.setTimeout(() => {
      lyricWheelLockRef.current = false;
    }, 180);
  };

  const renderLyrics = () => {
    if (lyricsState.status === "loading") {
      return <p className="text-2xl font-black text-neutral-700">Загружаю текст...</p>;
    }

    return [
      isBeforeFirstLyric ? (
        <div
          key="intro-dots"
          ref={(node) => {
            lyricRefs.current[-1] = node;
          }}
          className="karaoke-dots flex h-12 items-center justify-center gap-2"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>
      ) : null,
      ...lyricsState.lines.map((line, index) => {
        const isCurrent = index === activeLyricIndex && !isBeforeFirstLyric;

        return (
          <button
            type="button"
            key={`${line.time ?? index}-${line.text}`}
            ref={(node) => {
              lyricRefs.current[index] = node;
            }}
            onClick={() => seekToLyric(line, index)}
            disabled={!Number.isFinite(line.time)}
            aria-label={Number.isFinite(line.time) ? `Перемотать к ${formatTime(line.time)}` : undefined}
            className={`group relative w-full max-w-[760px] cursor-pointer text-center text-[28px] leading-tight transition-[color,opacity,transform] duration-300 disabled:cursor-default ${isCurrent
                ? "scale-[1.02] font-black text-white opacity-100"
                : "font-extrabold text-neutral-700 opacity-95 hover:text-neutral-500"
              }`}
          >
            <span>{line.text}</span>
            {Number.isFinite(line.time) && (
              <span className="absolute -right-16 top-1/2 hidden -translate-y-1/2 text-xs font-black text-white/25 group-hover:block">
                {formatTime(line.time)}
              </span>
            )}
          </button>
        );
      })
    ];
  };

  const renderQueue = () => (
    <div className="flex h-screen w-full flex-col px-10 py-16">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/28">Очередь</p>
          <h3 className="mt-1 text-3xl font-black tracking-tight text-white">Сейчас играет</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/45">
          {queue.length} треков
        </span>
      </div>

      <div
        onWheel={(e) => {
          e.currentTarget.scrollTop += e.deltaY;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          const container = e.currentTarget;
          const rect = container.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          if (offsetY < 60) {
            container.scrollTop -= 14;
          } else if (rect.height - offsetY < 60) {
            container.scrollTop += 14;
          }
        }}
        className="scrollbar-none min-h-0 flex-1 space-y-1 overflow-y-auto pr-2"
      >
        {queue.length ? queue.map((track, index) => {
          const isCurrent = index === currentIndex || track.id === currentTrack.id;
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
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQueueContextMenu({
                  track,
                  index,
                  x: e.clientX,
                  y: e.clientY
                });
              }}
              onClick={() => playTrack(track, queue)}
              className={[
                "group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition cursor-grab active:cursor-grabbing",
                isCurrent ? "bg-white/[0.10]" : "hover:bg-white/[0.055]",
                isDragging ? "opacity-30 scale-95" : "opacity-100",
                isDragOver ? "border-2 border-[#8341EF]" : "border border-transparent"
              ].join(" ")}
            >
              <div className="flex items-center gap-2 shrink-0">
                <svg className="h-4 w-4 fill-white/20 group-hover:fill-white/60 transition" viewBox="0 0 24 24">
                  <path d="M9 18h6v-2H9v2zm0-5h6v-2H9v2zm0-7v2h6V6H9z" />
                </svg>
                <span className="w-5 text-right text-xs font-black text-white/25">{index + 1}</span>
              </div>
              <img src={track.cover} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-white">{track.title}</span>
                <span className="block truncate text-xs font-semibold text-white/40">{track.artist}</span>
              </span>
              {isCurrent && (
                <span className="rounded-full bg-[var(--player-accent)] px-2 py-1 text-[10px] font-black text-white">
                  now
                </span>
              )}

              {/* Quick Remove from Queue Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(index);
                }}
                title="Удалить из очереди"
                className="opacity-0 group-hover:opacity-100 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-red-400 transition"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          );
        }) : (
          <div className="grid h-full place-items-center text-sm font-bold text-white/35">
            Очередь пустая
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex select-none text-white transition-opacity duration-300 ease-out ${isVisible && !isClosing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      style={{
        "--player-accent": `color-mix(in srgb, ${trackPalette.line} 50%, #4a4a4a)`,
        backgroundColor: `color-mix(in srgb, ${trackPalette.shadow} 28%, #171717)`
      }}
    >
      <button
        type="button"
        onClick={handleClose}
        className="absolute right-8 top-8 z-30 flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
        aria-label="Закрыть"
      >
        <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
      </button>

      <div className={`flex flex-col items-center justify-center p-8 transition-all duration-500 ease-in-out ${shouldShowSidePanel ? "w-1/2" : "w-full"}`}>
        <div
          className={`flex flex-col items-center gap-4 transition-all duration-300 ease-out ${isVisible && !isClosing ? "translate-y-0 scale-100" : "translate-y-4 scale-95"
            }`}
        >
          <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative h-80 w-80 cursor-pointer rounded-2xl shadow-2xl"
            style={{ boxShadow: "0 30px 90px rgba(0,0,0,.62)" }}
          >
            <img src={currentTrack.cover} alt={currentTrack.title} className="h-full w-full object-cover rounded-2xl" />

            <div
              className={`absolute inset-0 bg-black/50 rounded-2xl transition-opacity duration-300 ${isHovered ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidePanel((prev) => (prev === "queue" ? "none" : "queue"));
                }}
                className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/80 transition hover:scale-105 hover:bg-black/50"
                aria-label="Очередь"
              >
                <img src="/queue.svg" alt="" className="h-5 w-5 brightness-200" />
              </button>

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
                  className={[
                    "pointer-events-auto absolute left-4 transition hover:opacity-100",
                    isShuffle ? "opacity-100" : "opacity-60"
                  ].join(" ")}
                  aria-label="Случайный порядок"
                >
                  <img src="/shuffle.svg" alt="" className="h-5 w-5 brightness-200" />
                </button>

                <button type="button" onClick={(e) => { e.stopPropagation(); previous(); }} className="pointer-events-auto transition hover:scale-110 active:scale-95" aria-label="Назад">
                  <img src="/prev.svg" alt="" className="h-6 w-6 brightness-200" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--player-accent)] text-white shadow-lg transition hover:scale-105 active:scale-95"
                  aria-label={isPlaying ? "Пауза" : "Играть"}
                >
                  {isPlaying ? (
                    <svg className="h-7 w-7 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="h-7 w-7 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} className="pointer-events-auto transition hover:scale-110 active:scale-95" aria-label="Вперед">
                  <img src="/next.svg" alt="" className="h-6 w-6 brightness-200" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cycleRepeatMode(); }}
                  className={[
                    "pointer-events-auto absolute right-4 transition hover:opacity-100",
                    repeatMode !== "off" ? "opacity-100" : "opacity-60"
                  ].join(" ")}
                  aria-label="Повтор"
                >
                  <img src="/repeat.svg" alt="" className="h-5 w-5 brightness-200" />
                  {repeatMode !== "off" && (
                    <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--player-accent)] px-1 text-[9px] font-black leading-none text-white">
                      {repeatMode === "one" ? "1" : "∞"}
                    </span>
                  )}
                </button>
              </div>

              <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="pointer-events-auto">
                  <TrackMenuButton
                    track={currentTrack}
                    onOpenArtist={(artist) => {
                      onClose?.();
                      onOpenArtist?.(artist);
                    }}
                    onOpenAlbum={(album) => {
                      onClose?.();
                      onOpenAlbum?.(album);
                    }}
                    placement="top"
                  />
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSidePanel((prev) => (prev === "lyrics" ? "none" : "lyrics"));
                    setShowLyrics(true);
                  }}
                  title="Текст песни"
                  className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/30 transition hover:bg-black/50 hover:text-white ${sidePanel === "lyrics" ? "text-white" : "text-white/80"}`}
                >
                  <img src="/lyrics.svg" alt="" className="h-5 w-5 brightness-200" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleLike(); }}
                  className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/30 transition hover:bg-black/50 ${isLiked ? "text-white" : "text-white/80 hover:text-white"}`}
                  aria-label="Лайк"
                >
                  <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className={`h-5 w-5 ${isLiked ? "" : "brightness-200"}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-base font-bold text-white">{currentTrack.title}</h2>
            <div className="mt-2 flex max-w-80 flex-wrap items-center justify-center gap-1.5 overflow-hidden text-xs font-semibold text-white/60">
              {getTrackArtists(currentTrack).map((artist, index) => {
                const avatarUrl = artist.avatar || currentTrack.artistAvatar || currentTrack.cover || "/logo.png";
                return (
                  <React.Fragment key={`${artist.id || artist.name}-${index}`}>
                    {index > 0 && <span className="mx-0.5 font-light text-white/35">×</span>}
                    <button
                      type="button"
                      onClick={() => handleArtistClick(artist)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 transition hover:bg-white/15 hover:text-white group/artist"
                    >
                      <img
                        src={avatarUrl}
                        alt={artist.name || artist.username}
                        className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-white/20 transition group-hover/artist:scale-110"
                      />
                      <span>{artist.name || artist.username}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="w-80">
            <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-white/35">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="player-seek-wrap relative h-4">
              <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-[var(--player-accent)]" style={{ width: `${progress * 100}%` }} />
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(duration || 0, 1)}
                step="0.1"
                value={Math.min(currentTime || 0, duration || 0)}
                onChange={(event) => seek(Number(event.target.value))}
                disabled={!duration}
                aria-label="Перемотка"
                className="player-seek-slider"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ease-in-out ${shouldShowSidePanel ? "w-1/2 scale-100 opacity-100" : "pointer-events-none w-0 scale-95 opacity-0"
          }`}
      >
        {shouldShowQueuePanel ? (
          renderQueue()
        ) : shouldShowLyricsPanel ? (
          lyricsState.status === "plain" ? (
            <div className="scrollbar-none h-full w-full overflow-y-auto px-12 py-32" onWheel={(e) => e.stopPropagation()}>
              <div className="mx-auto flex max-w-[760px] flex-col gap-6 text-center text-[28px] font-extrabold leading-tight text-white/80">
                {lyricsState.lines.map((line, index) => (
                  <p key={`${index}-${line.text}`}>{line.text}</p>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={lyricsStageRef}
              onWheel={handleLyricsWheel}
              className="relative h-screen w-full overflow-hidden px-12"
            >
                          {/* Cover Art Container */}
            <div className="relative group flex items-center justify-center">
              {appearance?.fullOpenArtworkStyle === "vinyl" ? (
                <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
                  {/* Rotating Vinyl Record behind cover */}
                  <div className="absolute inset-0 rounded-full bg-[#111] border-4 border-[#222] shadow-2xl flex items-center justify-center animate-vinyl-spin">
                    <div className="w-24 h-24 rounded-full border-4 border-black/60 bg-[#1d1d21] flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-white/20" />
                    </div>
                  </div>
                  {/* Track Cover centered */}
                  <img
                    src={coverUrl}
                    alt={currentTrack?.title}
                    className="relative z-10 w-48 h-48 sm:w-60 sm:h-60 object-cover rounded-full shadow-2xl border-2 border-white/20"
                  />
                </div>
              ) : appearance?.fullOpenArtworkStyle === "glow" ? (
                <div className="relative">
                  <div className="absolute -inset-4 rounded-3xl bg-[var(--theme-accent,#8341EF)] opacity-40 blur-2xl animate-pulse" />
                  <img
                    src={coverUrl}
                    alt={currentTrack?.title}
                    className="relative z-10 w-64 h-64 sm:w-80 sm:h-80 object-cover rounded-3xl shadow-2xl border border-white/10"
                  />
                </div>
              ) : (
                <img
                  src={coverUrl}
                  alt={currentTrack?.title}
                  className="w-64 h-64 sm:w-80 sm:h-80 object-cover rounded-3xl shadow-2xl border border-white/10"
                />
              )}
            </div>
            </div>
          )
        ) : null}
      </div>

      {/* Queue Item Context Menu (Right Click) */}
      {queueContextMenu && (
        <TrackContextMenu
          track={queueContextMenu.track}
          onClose={() => setQueueContextMenu(null)}
          onOpenArtist={(artist) => {
            handleClose();
            onOpenArtist?.(artist);
          }}
          onOpenAlbum={(album) => {
            handleClose();
            onOpenAlbum?.(album);
          }}
          onRemoveFromQueue={() => {
            removeFromQueue(queueContextMenu.index);
          }}
          positionStyle={{
            position: "fixed",
            left: Math.min(queueContextMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 240),
            top: Math.min(queueContextMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 380),
            zIndex: 9999
          }}
        />
      )}
    </div>
  );
}
