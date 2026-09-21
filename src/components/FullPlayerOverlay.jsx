import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getCachedLyricsForTrack, getActiveLyricIndex, clearLyricsCacheForTrack } from "../services/lyricsApi";
import { useEscapeKey } from "../utils/useEscapeKey";
import { TrackContextMenu, TrackMenuButton } from "./TrackContextMenu";
import { LyricsContextMenu } from "./LyricsContextMenu";
import { getProfileSettings, saveProfileSettings, subscribeProfileSettings } from "../services/profileSettings";
import { getYandexCachedArtistAvatar, fetchYandexArtistAvatar } from "../services/yandexMusicApi";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
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

function formatLyricText(text) {
  if (typeof text !== "string") return text;
  const parts = text.split(/(\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("(") && part.endsWith(")")) {
      return (
        <span key={i} className="text-[0.85em] italic text-white/30">
          {part.slice(1, -1)}
        </span>
      );
    }
    return part;
  });
}

/** Extract annotation IDs from a line's text */
function getAnnotationIds(text) {
  if (typeof text !== "string") return [];
  const ids = [];
  const re = /<annotation id="([0-9]+)">/g;
  let m;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return [...new Set(ids)];
}

/** Render text, stripping <annotation> tags and applying formatLyricText */
function renderCleanText(text) {
  if (typeof text !== "string") return text;
  const cleaned = text.replace(/<\/?annotation[^>]*>/g, '');
  return formatLyricText(cleaned);
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

function OverlayArtistAvatar({ artist, track, size = "h-4 w-4", className = "" }) {
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
      className={`${size} shrink-0 rounded-full object-cover ring-1 ring-white/20 transition group-hover/artist:scale-110 ${className}`}
      onError={(e) => {
        if (e.currentTarget.src !== "/user.svg") {
          e.currentTarget.src = "/user.svg";
        }
      }}
    />
  );
}

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

export function FullPlayerOverlay({ appearance, onClose, onOpenArtist, onOpenAlbum }) {
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [sidePanel, setSidePanel] = useState("lyrics");
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [lyricsState, setLyricsState] = useState({
    status: "idle",
    lines: [],
    error: ""
  });
  const [profileSettings, setProfileSettings] = useState(getProfileSettings());
  const [lyricsContextMenu, setLyricsContextMenu] = useState(null);
  const [lyricsUserOffset, setLyricsUserOffset] = useState(0);
  const [expandedAnnotationId, setExpandedAnnotationId] = useState(null);

  const toggleAnnotationId = (annId) => {
    setExpandedAnnotationId(prev => prev === annId ? null : annId);
  };

  const handleUpdateLyricsOffset = (val) => {
    setLyricsUserOffset(val);
    if (currentTrack?.id) {
      try {
        const saved = JSON.parse(localStorage.getItem("amymusic.lyricsOffsets") || "{}");
        if (val === 0) {
          delete saved[currentTrack?.id];
        } else {
          saved[currentTrack?.id] = val;
        }
        localStorage.setItem("amymusic.lyricsOffsets", JSON.stringify(saved));
      } catch (e) {
        console.error("Failed to save lyrics offset", e);
      }
    }
  };

  const handleReloadLyrics = () => {
    if (!currentTrack) return;
    const prefSource = profileSettings?.lyricsSettings?.preferredSource || "auto";
    clearLyricsCacheForTrack(currentTrack, prefSource);
    setLyricsContextMenu(null);
    setLyricsState({ status: "loading", lines: [], error: "" });
    getCachedLyricsForTrack(currentTrack, duration, null, prefSource)
      .then((nextLyricsState) => {
        setLyricsState(nextLyricsState);
      });
  };

  useEffect(() => {
    return subscribeProfileSettings(setProfileSettings);
  }, []);

  const lyricsSettings = profileSettings.lyricsSettings || {
    textSize: "lg",
    displayMode: "cover-text",
    syncMode: "lines",
    textStyle: "blur"
  };

  const lyricsStageRef = useRef(null);
  const lyricRefs = useRef([]);
  const lyricWheelLockRef = useRef(false);
  const [isAutoplay, setIsAutoplay] = useState(true);
  const {
    currentTrack,
    trackPalette,
    audioEnergy,
    isPlaying,
    isLiked,
    isDisliked,
    toggleDislike,
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
    removeFromQueue,
    setIsEqualizerOpen,
    playHistory,
    likedTrackIds,
    clearHistory
  } = useAudioPlayer();

  const prevIndex = useRef(currentIndex);
  const slideClass = useRef("animate-slideInRight");

  if (currentIndex !== prevIndex.current) {
    slideClass.current = currentIndex > prevIndex.current ? "animate-slideInRight" : "animate-slideInLeft";
    prevIndex.current = currentIndex;
  }

  const coverUrl = currentTrack?.cover || "/logo.png";

  const [draggedQueueIndex, setDraggedQueueIndex] = useState(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState(null);
  const [touchDragIndex, setTouchDragIndex] = useState(null);
  const [touchOverIndex, setTouchOverIndex] = useState(null);

  const handleTouchStartQueue = (index) => {
    setTouchDragIndex(index);
    setTouchOverIndex(index);
  };

  const handleTouchMoveQueue = (e) => {
    if (touchDragIndex === null || !e.touches || !e.touches[0]) return;
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const targetElement = document.elementFromPoint(touchX, touchY);
    if (targetElement) {
      const queueItem = targetElement.closest("[data-queue-index]");
      if (queueItem) {
        const targetIndex = Number(queueItem.getAttribute("data-queue-index"));
        if (!isNaN(targetIndex) && targetIndex !== touchOverIndex) {
          setTouchOverIndex(targetIndex);
        }
      }
    }
  };

  const handleTouchEndQueue = () => {
    if (touchDragIndex !== null && touchOverIndex !== null && touchDragIndex !== touchOverIndex) {
      reorderQueue(touchDragIndex, touchOverIndex);
    }
    setTouchDragIndex(null);
    setTouchOverIndex(null);
  };

  const playerTouchStartRef = useRef(null);
  const queueModalTouchStartRef = useRef(null);

  const handlePlayerTouchStart = (e) => {
    if (
      isQueueModalOpen ||
      isTouchDragging.current ||
      e.target.closest("input, button, [data-queue-handle], [data-no-swipe], [data-lyrics-container], .lyrics-stage, .animate-bottom-sheet")
    ) return;
    if (e.touches && e.touches.length === 1) {
      playerTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handlePlayerTouchEnd = (e) => {
    if (isQueueModalOpen) return;
    if (!playerTouchStartRef.current || !e.changedTouches || e.changedTouches.length === 0) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - playerTouchStartRef.current.x;
    const deltaY = touchEnd.clientY - playerTouchStartRef.current.y;
    const deltaTime = Date.now() - playerTouchStartRef.current.time;
    playerTouchStartRef.current = null;

    if (deltaTime > 600) return;

    if (deltaY > 50 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      handleClose();
      return;
    }

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < 0) {
        next();
      } else {
        previous();
      }
    }
  };

  const handleQueueModalTouchStart = (e) => {
    e.stopPropagation();
    if (e.target.closest("[data-queue-handle], button, input")) return;
    if (e.touches && e.touches.length === 1) {
      queueModalTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handleQueueModalTouchEnd = (e) => {
    e.stopPropagation();
    if (!queueModalTouchStartRef.current || !e.changedTouches || e.changedTouches.length === 0) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - queueModalTouchStartRef.current.x;
    const deltaY = touchEnd.clientY - queueModalTouchStartRef.current.y;
    const deltaTime = Date.now() - queueModalTouchStartRef.current.time;
    queueModalTouchStartRef.current = null;

    if (deltaTime > 600) return;

    if (deltaY > 50 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      setIsQueueModalOpen(false);
    }
  };

  const activeLyricIndex = useMemo(
    () => getActiveLyricIndex(lyricsState.lines, currentTime + lyricsUserOffset / 1000),
    [currentTime, lyricsState.lines, lyricsUserOffset]
  );
  const firstLyricTime = lyricsState.lines[0]?.time;
  const isBeforeFirstLyric =
    Number.isFinite(firstLyricTime) && currentTime + 0.08 < firstLyricTime;
  const lyricsAnchorIndex = isBeforeFirstLyric ? -1 : activeLyricIndex;
  const shouldShowLyricsPanel = sidePanel === "lyrics" && showLyrics;
  const shouldShowQueuePanel = sidePanel === "queue";
  const shouldShowSidePanel = shouldShowLyricsPanel || shouldShowQueuePanel;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const prevTrackIdRef = useRef(currentTrack?.id);
  const skipNextTransitionRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    const trackId = currentTrack?.id;
    
    if (prevTrackIdRef.current !== trackId) {
      lyricRefs.current = [];
      setLyricsOffset(0);
      prevTrackIdRef.current = trackId;
    }

    if (!trackId || trackId === "empty") {
      setLyricsUserOffset(0);
      setLyricsState({ status: "empty", lines: [], error: "" });
      return undefined;
    }

    try {
      const saved = JSON.parse(localStorage.getItem("amymusic.lyricsOffsets") || "{}");
      setLyricsUserOffset(saved[trackId] || 0);
    } catch (e) {
      setLyricsUserOffset(0);
    }

    setLyricsState({ status: "loading", lines: [], error: "" });

    getCachedLyricsForTrack(currentTrack, duration, null, profileSettings?.lyricsSettings?.preferredSource || "auto")
      .then((nextLyricsState) => {
        if (!isCancelled) {
          if (nextLyricsState.status === "synced") {
             skipNextTransitionRef.current = true;
          }
          setLyricsState(nextLyricsState);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, profileSettings?.lyricsSettings?.preferredSource]);

  const touchStartY = useRef(0);
  const touchStartOffset = useRef(0);
  const isTouchDragging = useRef(false);
  const lastTouchY = useRef(0);

  useLayoutEffect(() => {
    if (isTouchDragging.current) return;
    if ((!shouldShowLyricsPanel && !isMobile) || lyricsAnchorIndex < -1) {
      setLyricsOffset(0);
      return;
    }

    const stage = lyricsStageRef.current;
    if (!stage) return;

    const recalculateOffset = () => {
      const anchor = lyricRefs.current[lyricsAnchorIndex];
      if (!stage || !anchor) return;
      const nextOffset = stage.clientHeight / 2 - anchor.offsetTop - anchor.offsetHeight / 2;
      setLyricsOffset(nextOffset);
      
      // If we just loaded new lyrics, allow one frame for the instant offset to apply, 
      // then re-enable transitions for subsequent scrolling.
      if (skipNextTransitionRef.current) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            skipNextTransitionRef.current = false;
          });
        });
      }
    };

    recalculateOffset();

    const wrapper = stage.firstElementChild;
    const resizeObserver = new ResizeObserver(() => {
      recalculateOffset();
    });

    resizeObserver.observe(stage);
    if (wrapper) {
      resizeObserver.observe(wrapper);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [lyricsAnchorIndex, lyricsState.lines, shouldShowLyricsPanel, isMobile, lyricsSettings.textSize, lyricsSettings.displayMode, lyricsSettings.textStyle, lyricsSettings.syncMode]);

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const handleArtistClick = (artist) => {
    const artistName = artist.name || artist.username || "";
    const isYandex = currentTrack.source === "yandex" || String(currentTrack.id).startsWith("yandex_");
    onOpenArtist?.({
      id: isYandex ? "" : (artist.id || ""),
      name: artistName,
      username: artist.username || artist.name,
      avatar: getYandexCachedArtistAvatar(artistName) || artist.avatar || currentTrack.artistAvatar || currentTrack.cover || "/logo.png",
      permalinkUrl: artist.permalinkUrl || "",
      tags: []
    });
    handleClose();
  };

  const primaryArtist = getTrackArtists(currentTrack)[0];

  useEscapeKey(true, () => {
    if (isQueueModalOpen) {
      setIsQueueModalOpen(false);
      return;
    }
    if (isMoreOpen) {
      setIsMoreOpen(false);
      return;
    }
    if (expandedAnnotationId !== null) {
      setExpandedAnnotationId(null);
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

  const handleTouchStart = (event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!lyricsState.lines.length || !event.touches[0]) return;
    touchStartY.current = event.touches[0].clientY;
    lastTouchY.current = event.touches[0].clientY;
    touchStartOffset.current = lyricsOffset;
    isTouchDragging.current = true;
  };

  const handleTouchMove = (event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!isTouchDragging.current || !event.touches[0]) return;
    const currentY = event.touches[0].clientY;
    lastTouchY.current = currentY;
    const deltaY = currentY - touchStartY.current;
    setLyricsOffset(touchStartOffset.current + deltaY);
  };

  const handleTouchEnd = (event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!isTouchDragging.current) return;
    isTouchDragging.current = false;

    const totalDelta = lastTouchY.current - touchStartY.current;
    if (Math.abs(totalDelta) < 15) return;

    const stage = lyricsStageRef.current;
    if (!stage || !lyricsState.lines.length) return;

    const stageCenter = stage.clientHeight / 2;
    let closestIndex = activeLyricIndex >= 0 ? activeLyricIndex : 0;
    let minDistance = Infinity;

    lyricsState.lines.forEach((_, idx) => {
      const el = lyricRefs.current[idx];
      if (!el) return;
      const elCenter = el.offsetTop + el.offsetHeight / 2 + lyricsOffset;
      const dist = Math.abs(elCenter - stageCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = idx;
      }
    });

    const targetLine = lyricsState.lines[closestIndex];
    if (targetLine) {
      seekToLyric(targetLine, closestIndex);
    }
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
          className={`karaoke-dots flex h-12 items-center gap-2 ${lyricsSettings.displayMode === "text-only" ? "justify-center" : "justify-start"}`}
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
            className={`group relative w-full max-w-[760px] cursor-pointer ${lyricsSettings.displayMode === "text-only" ? "text-center" : "text-left"} text-[28px] leading-tight transition-[color,opacity,transform] duration-300 disabled:cursor-default ${isCurrent
                ? "scale-[1.02] font-medium text-white opacity-100"
                : "font-medium text-neutral-700 opacity-95 hover:text-neutral-500"
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

              <TrackMenuButton track={track} />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(index);
                }}
                title="Удалить из очереди"
                className="opacity-60 md:opacity-0 md:group-hover:opacity-100 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-red-400 transition cursor-pointer"
              >
                <svg className="h-4 w-4 fill-current pointer-events-none" viewBox="0 0 24 24">
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

  const renderLyricsContent = (isMobileLyrics = false) => {
    if (lyricsState.status === "loading") {
      return (
        <div key="lyrics-loading" className="grid h-full place-items-center text-sm font-bold text-white/40 animate-pulse">
          Загрузка текста...
        </div>
      );
    }
    if (!lyricsState.lines || lyricsState.lines.length === 0) {
      return (
        <div key="lyrics-empty" className="grid h-full place-items-center text-sm font-bold text-white/40 text-center px-4">
          {lyricsState.status === "instrumental" ? "♫ Инструментальный трек" : "Текст песни не найден"}
        </div>
      );
    }
    if (lyricsState.status === "plain") {
      const plainSizes = { sm: "text-[14px]", base: "text-[18px]", lg: "text-[24px]", xl: "text-[32px]" };
      return (
        <div 
          key="lyrics-plain"
          className="scrollbar-none h-full w-full overflow-y-auto px-4 py-6 select-text" 
          onWheel={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            setLyricsContextMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <div key={`plain-${lyricsSettings.displayMode}`} className={`animate-in fade-in zoom-in-[0.98] duration-500 mx-auto flex max-w-[760px] flex-col gap-4 ${lyricsSettings.displayMode === "text-only" ? "text-center" : "text-left"} font-medium leading-normal text-white/80 ${plainSizes[lyricsSettings.textSize] || "text-[24px]"}`}>
            {lyricsState.lines.map((line, index) => {
              const isSectionHeader = /^\[.*\]$/.test(line.text.replace(/<[^>]+>/g, '').trim());
              if (isSectionHeader) {
                return <div key={`${index}-${line.text}`} className="h-8 select-none" />;
              }
              const annIds = getAnnotationIds(line.text);
              const hasAnnotation = annIds.length > 0 && lyricsState.annotations && annIds.some(id => lyricsState.annotations[id]);
              const isExpanded = expandedAnnotationId && annIds.includes(expandedAnnotationId);

              return (
                <div key={`${index}-${line.text}`}>
                  <p
                    className={hasAnnotation ? "cursor-pointer group" : ""}
                    onClick={hasAnnotation ? (e) => { e.stopPropagation(); toggleAnnotationId(annIds[0]); } : undefined}
                  >
                    {renderCleanText(line.text)}
                    {hasAnnotation && (
                      <span className="inline-block ml-2 text-[1em] font-bold text-white/50 align-middle select-none transition-colors group-hover:text-white/80">"</span>
                    )}
                  </p>
                  {hasAnnotation && (
                    <div
                      className={`grid transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-2 mb-1 ml-4 border-l-2 border-white/10 pl-4 text-[0.75em] leading-snug text-white/50 whitespace-pre-line">
                          {annIds.map(id => lyricsState.annotations?.[id]).filter(Boolean).join('\n')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div
        key="lyrics-synced"
        ref={lyricsStageRef}
        data-lyrics-container="true"
        data-no-swipe="true"
        onWheel={handleLyricsWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setLyricsContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className={isMobileLyrics ? "relative h-full w-full overflow-hidden px-3 touch-pan-y select-none" : "relative h-full w-full overflow-hidden px-12 touch-none select-none"}
      >
        <div
          key={lyricsSettings.displayMode}
          className={
            isMobileLyrics
              ? `animate-in fade-in zoom-in-[0.98] duration-500 mx-auto flex flex-col gap-5 ${lyricsSettings.displayMode === "text-only" ? "text-center" : "text-left"} max-xs:text-[16px] font-extrabold leading-[1.25] tracking-tight transition-all duration-300 ease-out ${
                  lyricsSettings.textSize === "sm" ? "text-[15px]" :
                  lyricsSettings.textSize === "base" ? "text-[17px]" :
                  lyricsSettings.textSize === "lg" ? "text-[19px]" : "text-[22px]"
                }`
              : `animate-in fade-in zoom-in-[0.98] duration-500 mx-auto flex w-[760px] max-w-full flex-col gap-8 ${lyricsSettings.displayMode === "text-only" ? "text-center" : "text-left"} font-extrabold leading-[1.2] tracking-tight transition-all duration-300 ease-out ${
                  lyricsSettings.textSize === "sm" ? "text-[20px]" :
                  lyricsSettings.textSize === "base" ? "text-[28px]" :
                  lyricsSettings.textSize === "lg" ? "text-[36px]" : "text-[46px]"
                }`
          }
          style={{ 
            transform: `translateY(${lyricsOffset}px)`,
            transitionDuration: skipNextTransitionRef.current ? "0ms" : undefined
          }}
        >
          {lyricsState.lines.length > 0 && (() => {
            const introDist = isBeforeFirstLyric ? 0 : Math.abs(-1 - activeLyricIndex);
            const introBlur = introDist === 0 ? 0 : Math.min(10, introDist * 3);
            const introOpacity = introDist > 3 ? 0 : (introDist === 0 ? 1 : Math.max(0.1, 0.4 - introDist * 0.1));

            return (
              <div
                ref={(el) => {
                  if (el) lyricRefs.current[-1] = el;
                }}
                style={{
                  filter: `blur(${introBlur}px)`,
                  opacity: introOpacity,
                  transform: `scale(${introDist === 0 ? 1.1 : 0.95})`,
                  pointerEvents: introDist > 3 ? "none" : "auto"
                }}
                className="flex items-center justify-center gap-3 py-3 transition-all duration-500 ease-out"
              >
                <div className={`h-3.5 w-3.5 rounded-full bg-white ${isBeforeFirstLyric ? 'animate-bounce' : ''}`} style={{ animationDelay: "0ms" }} />
                <div className={`h-3.5 w-3.5 rounded-full bg-white ${isBeforeFirstLyric ? 'animate-bounce' : ''}`} style={{ animationDelay: "150ms" }} />
                <div className={`h-3.5 w-3.5 rounded-full bg-white ${isBeforeFirstLyric ? 'animate-bounce' : ''}`} style={{ animationDelay: "300ms" }} />
              </div>
            );
          })()}
          {lyricsState.lines.map((line, index) => {
            const activeIndex = isBeforeFirstLyric ? -1 : activeLyricIndex;
            const dist = Math.abs(index - activeIndex);

            let blurPx = 0;
            let lineOpacity = 1;
            let lineScale = 1;

            if (lyricsSettings.textStyle === "scale") {
              lineScale = dist === 0 ? 1.2 : 1.0;
              lineOpacity = dist === 0 ? 1 : 0.4;
            } else if (lyricsSettings.textStyle === "blur") {
              if (dist === 0) { blurPx = 0; lineOpacity = 1; lineScale = 1.05; }
              else if (dist === 1) { blurPx = 2; lineOpacity = 0.55; lineScale = 0.98; }
              else if (dist === 2) { blurPx = 4; lineOpacity = 0.35; lineScale = 0.95; }
              else if (dist === 3) { blurPx = 6; lineOpacity = 0.15; lineScale = 0.90; }
              else { blurPx = 12; lineOpacity = 0; lineScale = 0.85; }
            } else {
              lineOpacity = dist === 0 ? 1 : 0.4;
              lineScale = 1.0;
            }

            const isActive = dist === 0;

            let content = renderCleanText(line.text);
            if (lyricsSettings.syncMode === "words" && isActive) {
              const nextTime = lyricsState.lines[index + 1]?.time || (line.time + 3.0);
              const timeDiff = nextTime - line.time;
              const words = line.text.split(/(\s+)/);
              const maxLineDuration = Math.max(2.0, (words.length / 2) * 0.4); 
              const lineDuration = Math.min(timeDiff, maxLineDuration);
              
              const progress = Math.max(0, Math.min(1, (currentTime + lyricsUserOffset / 1000 - line.time) / lineDuration));
              const activeWordIndex = Math.floor(progress * words.length);

              let inBracket = false;
              content = words.map((word, wIdx) => {
                const isWordActive = wIdx <= activeWordIndex;
                const hasOpen = word.includes('(');
                const hasClose = word.includes(')');
                
                if (hasOpen) inBracket = true;
                const currentlyInBracket = inBracket;
                if (hasClose) inBracket = false;

                return (
                  <span
                    key={`${wIdx}-${word}`}
                    className={`transition-colors duration-200 ${currentlyInBracket ? "text-[0.85em] italic text-white/30" : (isWordActive ? "text-white" : "text-white/40")}`}
                  >
                    {word.replace(/[()]/g, '')}
                  </span>
                );
              });
            }

            return (
              <p
                key={`${index}-${line.time}`}
                ref={(el) => {
                  if (el) lyricRefs.current[index] = el;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dist <= 3) seekToLyric(line, index);
                }}
                style={{
                  filter: `blur(${blurPx}px)`,
                  opacity: lineOpacity,
                  transform: `scale(${lineScale})`,
                  pointerEvents: dist > 3 ? "none" : "auto"
                }}
                className={`cursor-pointer font-medium transition-all duration-500 ease-out ${
                  dist <= 3 ? "hover:!opacity-95 hover:!filter-none hover:!scale-100" : ""
                } ${
                  isActive ? "text-white drop-shadow-lg" : "text-white/80"
                }`}
              >
                {content}
              </p>
            );
          })}
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <div
        onTouchStart={handlePlayerTouchStart}
        onTouchEnd={handlePlayerTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setLyricsContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`fixed inset-0 z-[100] flex flex-col justify-between select-none text-white bg-[#090909] transition-opacity duration-300 ease-out overflow-hidden ${
          isVisible && !isClosing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          "--player-accent": `color-mix(in srgb, ${trackPalette.line} 50%, #8341EF)`
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#090909]">
          <div className="absolute inset-0 opacity-50 blur-[90px] animate-cover-breathe transform-gpu">
            <img
              src={coverUrl}
              alt=""
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.png"; }}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="absolute inset-0 filter blur-[80px] opacity-80 transform-gpu">
            <div
              className="absolute -top-[20%] -left-[20%] h-[80vw] w-[80vw] rounded-full animate-fluid-blob-1 opacity-80 transition-transform duration-300 ease-out"
              style={{
                backgroundColor: trackPalette?.base || "#2a0a4a",
                transform: `scale(${1 + (audioEnergy?.bass || 0) * 0.22})`
              }}
            />
            <div
              className="absolute -top-[10%] -right-[20%] h-[85vw] w-[85vw] rounded-full animate-fluid-blob-2 opacity-75 transition-transform duration-300 ease-out"
              style={{
                backgroundColor: trackPalette?.line || "#9b5cff",
                transform: `scale(${1 + (audioEnergy?.mids || 0) * 0.2})`
              }}
            />
            <div
              className="absolute top-[35%] left-[5%] h-[90vw] w-[90vw] rounded-full animate-fluid-blob-3 opacity-65 transition-transform duration-300 ease-out"
              style={{
                backgroundColor: trackPalette?.bright || "#d8b4fe",
                transform: `scale(${1 + (audioEnergy?.level || 0) * 0.25})`
              }}
            />
            <div
              className="absolute bottom-[-15%] right-[-15%] h-[95vw] w-[95vw] rounded-full animate-fluid-blob-1 opacity-75 transition-transform duration-300 ease-out"
              style={{
                backgroundColor: trackPalette?.shadow || "#4c1d95",
                transform: `scale(${1 + (audioEnergy?.bass || 0) * 0.28})`
              }}
            />
          </div>

          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-[#090909]/65 to-[#090909] z-10" />
        </div>

        <div className="absolute top-[calc(0.5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30 z-40 pointer-events-none" />

        <div className="relative z-30 flex w-full items-center justify-between px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-2 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 active:scale-95 shrink-0"
            aria-label="Скрыть"
            title="Скрыть"
          >
            <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
            </svg>
          </button>

          <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 border border-white/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setSidePanel("none")}
              className={`rounded-full px-4 py-1.5 text-xs font-black transition ${
                sidePanel === "none" ? "bg-white text-black shadow-md" : "text-white/70 hover:text-white"
              }`}
            >
              Песня
            </button>
            <button
              type="button"
              onClick={() => setSidePanel("lyrics")}
              className={`rounded-full px-4 py-1.5 text-xs font-black transition ${
                sidePanel === "lyrics" ? "bg-white text-black shadow-md" : "text-white/70 hover:text-white"
              }`}
            >
              Текст
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsQueueModalOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 active:scale-95 shrink-0"
            aria-label="Очередь"
            title="Очередь"
          >
            <img src="/queue.svg" alt="" className="h-5 w-5 brightness-200" />
          </button>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-between px-6 pt-0 pb-3 text-white">
          <div className="flex flex-1 min-h-0 w-full items-center justify-center py-1">
            {sidePanel === "lyrics" ? (
              <div
                className="relative h-full w-full max-w-md max-h-[46vh] cursor-pointer overflow-hidden flex flex-col justify-center select-none"
                onClick={() => setSidePanel("none")}
              >
                {renderLyricsContent(true)}
              </div>
            ) : (
              <div
                className="relative aspect-square w-[min(100%,_240px)] max-h-[35vh] cursor-pointer rounded-2xl shadow-2xl overflow-hidden shrink-0"
                style={{ boxShadow: "0 20px 60px rgba(0,0,0,.7)" }}
                onClick={() => setSidePanel("lyrics")}
              >
                <img src={coverUrl} alt={currentTrack?.title || ""} className="h-full w-full object-cover rounded-2xl" />
              </div>
            )}
          </div>

          <div className="w-full max-w-sm shrink-0 flex flex-col items-center gap-3 mt-2 mb-2">
            <div className="w-full px-2 flex flex-col gap-0.5 text-center">
              <h2 className="text-lg max-xs:text-base font-extrabold text-white truncate max-w-[88vw] mx-auto leading-tight">
                {currentTrack?.title || "Без названия"}
              </h2>
              <div className="flex max-w-[88vw] flex-wrap items-center justify-center gap-1.5 overflow-hidden text-xs font-semibold text-white/60 mx-auto mb-1">
                {getTrackArtists(currentTrack).map((artist, index) => {
                  return (
                    <React.Fragment key={`${artist.id || artist.name}-${index}`}>
                      {index > 0 && <span className="mx-0.5 font-light text-white/35">×</span>}
                      <button
                        type="button"
                        onClick={() => handleArtistClick(artist)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 transition hover:bg-white/15 hover:text-white"
                      >
                        <OverlayArtistAvatar artist={artist} track={currentTrack} />
                        <span>{artist.name || artist.username}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="player-seek-wrap relative h-4 mt-1">
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-[var(--player-accent)]" style={{ width: `${(progress || 0) * 100}%` }} />
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
              <div className="mt-0.5 flex items-center justify-between text-[11px] font-semibold text-white/40">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex w-full max-w-xs items-center justify-between px-2">
              <button
                type="button"
                onClick={() => toggleDislike(currentTrack?.id, currentTrack)}
                className="flex h-10 w-10 items-center justify-center transition active:scale-95"
                aria-label="Дизлайк"
                title="Дизлайк"
              >
                <svg
                  className={`h-6 w-6 transition-colors ${isDisliked ? "fill-[#8341EF]" : "fill-white/50 opacity-70 hover:opacity-100"}`}
                  viewBox="0 0 24 22"
                >
                  <path fillRule="evenodd" clipRule="evenodd" d="M17.8212 16.7055L21.081 19.4508L22.5105 17.7534L1.42948 0L0 1.69743L2.46855 3.77631C1.70961 4.89297 1.26953 6.33731 1.26953 8.06101C1.26953 11.9861 4.22921 14.5651 6.67973 16.5225C6.94981 16.7383 7.21387 16.9463 7.47062 17.1487C8.44852 17.9193 9.3203 18.6061 10.0123 19.3128C10.8831 20.2018 11.2558 20.9169 11.2558 21.5858H13.475C13.475 20.9169 13.8477 20.2018 14.7184 19.3128C15.4105 18.6061 16.2821 17.9192 17.26 17.1487C17.4435 17.0041 17.6308 16.8566 17.8212 16.7055ZM16.0882 15.2461L4.1805 5.21803C3.7654 5.91242 3.48871 6.84633 3.48871 8.06101C3.48871 10.7933 5.52215 12.7576 8.06476 14.7886C8.30011 14.9766 8.54083 15.1661 8.78332 15.357C9.77472 16.1373 10.7953 16.9407 11.5977 17.7599C11.8676 18.0356 12.8631 18.0356 13.133 17.7599C13.9355 16.9407 14.956 16.1373 15.9475 15.357C15.9944 15.32 16.0414 15.283 16.0882 15.2461ZM17.3352 1.23124C15.509 1.26961 13.7485 2.14104 12.5963 3.74083L14.3034 5.17015C15.0718 4.01573 16.262 3.47345 17.3818 3.44992C18.3427 3.42972 19.2908 3.78206 20.0004 4.5031C20.7027 5.21665 21.2421 6.36524 21.2421 8.06101C21.2421 8.9416 21.0308 9.7424 20.6594 10.4914L22.3964 11.9456C23.0454 10.8145 23.4612 9.53222 23.4612 8.06101C23.4612 5.87314 22.7522 4.13532 21.5821 2.94644C20.4193 1.76506 18.8709 1.19897 17.3352 1.23124Z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={previous}
                className="flex h-10 w-10 items-center justify-center transition opacity-80 hover:opacity-100 active:scale-95"
                aria-label="Предыдущий трек"
                title="Предыдущий трек"
              >
                <img src="/prev.svg" alt="" className="h-6 w-6 brightness-200" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#8341EF] text-white shadow-xl transition hover:scale-105 active:scale-95"
                aria-label={isPlaying ? "Пауза" : "Играть"}
                title={isPlaying ? "Пауза" : "Играть"}
              >
                {isPlaying ? (
                  <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="ml-0.5 h-6 w-6 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={next}
                className="flex h-10 w-10 items-center justify-center transition opacity-80 hover:opacity-100 active:scale-95"
                aria-label="Следующий трек"
                title="Следующий трек"
              >
                <img src="/next.svg" alt="" className="h-6 w-6 brightness-200" />
              </button>

              <button
                type="button"
                onClick={toggleLike}
                className="flex h-10 w-10 items-center justify-center transition active:scale-95"
                aria-label="Лайк"
                title="Лайк"
              >
                <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className={`h-6 w-6 ${isLiked ? "" : "brightness-200 opacity-70"}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-20 flex w-full items-center justify-around px-6 py-3 pb-4 bg-transparent shrink-0">
          <button
            type="button"
            onClick={cycleRepeatMode}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${repeatMode !== "off" ? "opacity-100 text-[#8341EF]" : "opacity-50 hover:opacity-100 text-white"}`}
            aria-label="Повтор"
            title="Повтор"
          >
            <img src="/repeat.svg" alt="" className={`h-5 w-5 ${repeatMode !== "off" ? "" : "brightness-200"}`} />
            {repeatMode !== "off" && (
              <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#8341EF] px-1 text-[9px] font-black text-white">
                {repeatMode === "one" ? "1" : "∞"}
              </span>
            )}
          </button>

          {/* 2. Equalizer */}
          <button
            type="button"
            onClick={() => setIsEqualizerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full opacity-60 transition hover:opacity-100 active:scale-95 text-white"
            aria-label="Эквалайзер"
            title="Эквалайзер"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />
            </svg>
          </button>

          {/* 3. Text (Lyrics) */}
          <button
            type="button"
            onClick={() => setSidePanel((prev) => (prev === "lyrics" ? "none" : "lyrics"))}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${sidePanel === "lyrics" ? "opacity-100 text-[#8341EF] bg-white/10" : "opacity-60 hover:opacity-100 text-white"}`}
            aria-label="Текст песни"
            title="Текст песни"
          >
            <img src="/lyrics.svg" alt="" className="h-5 w-5 brightness-200" />
          </button>

          {/* 4. Random tracks (Shuffle) */}
          <button
            type="button"
            onClick={toggleShuffle}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${isShuffle ? "opacity-100 text-[#8341EF]" : "opacity-50 hover:opacity-100 text-white"}`}
            aria-label="Случайный порядок"
            title="Случайный порядок"
          >
            <img src="/shuffle.svg" alt="" className="h-5 w-5 brightness-200" />
          </button>
        </div>

        {/* Mobile Queue Screen (Next Up) */}
        {isQueueModalOpen && (
          <div
            onTouchStart={handleQueueModalTouchStart}
            onTouchEnd={handleQueueModalTouchEnd}
            className="fixed inset-0 z-[110] flex flex-col bg-[#090909] text-white select-none animate-bottom-sheet"
          >
            {/* Top Drag Indicator */}
            <div className="absolute top-[calc(0.5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30 z-30 pointer-events-none" />

            {/* Header */}
            <div className="flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between px-4 border-b border-white/[0.08] bg-[#090909]/95 backdrop-blur-xl z-20 pt-[env(safe-area-inset-top,0px)]">
              {/* Close Chevron Button */}
              <button
                type="button"
                onClick={() => setIsQueueModalOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/15 active:scale-95 transition"
                aria-label="Закрыть"
                title="Закрыть"
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
              </button>

              {/* Title & Count */}
              <div className="text-center">
                <h2 className="text-base font-black tracking-tight text-white">Очередь</h2>
                <p className="text-[10px] font-bold text-white/40">{queue?.length || 0} треков</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-95 ${
                    isShuffle ? "opacity-100 text-[#8341EF]" : "opacity-50 hover:opacity-100 text-white"
                  }`}
                  aria-label="Случайный порядок"
                  title="Случайный порядок"
                >
                  <img src="/shuffle.svg" alt="" className={`h-4.5 w-4.5 ${isShuffle ? "" : "brightness-200"}`} />
                </button>
                <button
                  type="button"
                  onClick={cycleRepeatMode}
                  className={`relative grid h-9 w-9 place-items-center rounded-full transition active:scale-95 ${
                    repeatMode !== "off" ? "opacity-100 text-[#8341EF]" : "opacity-50 hover:opacity-100 text-white"
                  }`}
                  aria-label="Повтор"
                  title="Повтор"
                >
                  <img src="/repeat.svg" alt="" className={`h-4.5 w-4.5 ${repeatMode !== "off" ? "" : "brightness-200"}`} />
                  {repeatMode === "one" && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#8341EF] px-1 text-[8px] font-black text-white">
                      1
                    </span>
                  )}
                  {repeatMode === "playlist" && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#8341EF] px-1 text-[8px] font-black text-white">
                      ∞
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Scrollable List Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
              
              {/* Section 1: History */}
              {playHistory && playHistory.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/35">История</h3>
                    {clearHistory && (
                      <button
                        type="button"
                        onClick={clearHistory}
                        className="text-[11px] font-semibold text-white/30 hover:text-white/70 transition"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {playHistory.slice(0, 10).map((histTrack, idx) => {
                      const isFav = likedTrackIds?.has?.(histTrack.id) || (Array.isArray(likedTrackIds) && likedTrackIds.includes(histTrack.id));
                      return (
                        <div
                          key={`hist-${histTrack.id}-${idx}`}
                          onClick={() => playTrack(histTrack)}
                          className="flex items-center gap-3 rounded-2xl p-2.5 bg-white/[0.02] hover:bg-white/[0.055] transition cursor-pointer opacity-60 hover:opacity-100"
                        >
                          <img src={histTrack.cover || "/logo.png"} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover bg-white/[0.04]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">{histTrack.title}</p>
                            <p className="truncate text-xs font-semibold text-white/35">{histTrack.artist}</p>
                          </div>
                          {isFav && (
                            <img src="/like.svg" alt="Favorite" className="h-4 w-4 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Section 2: Currently Playing */}
              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/35">Сейчас играет</h3>
                {currentTrack && currentTrack.id !== "empty" ? (
                  <div className="flex items-center gap-3.5 p-1 transition">
                    <img src={currentTrack.cover || "/logo.png"} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover bg-white/[0.04]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">{currentTrack.title}</p>
                      <p className="truncate text-xs font-semibold text-white/35 mt-0.5">{currentTrack.artist}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-white/35 italic">Ничего не играет</p>
                )}
              </section>

              {/* Section 3: Playing Next */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/35">Далее в очереди</h3>
                  
                  {/* Autoplay Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none rounded-full bg-white/[0.04] border border-white/[0.08] px-2.5 py-1">
                    <span className="text-[11px] font-bold text-white/60">Автовоспроизведение</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isAutoplay}
                      onClick={() => setIsAutoplay(!isAutoplay)}
                      className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isAutoplay ? "bg-emerald-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          isAutoplay ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Queue Items */}
                <div className="space-y-1">
                  {queue && queue.length > 0 ? (
                    queue.map((track, index) => {
                      const isCurrent = index === currentIndex || track.id === currentTrack?.id;
                      const isDragging = draggedQueueIndex === index || touchDragIndex === index;
                      const isDragOver = dragOverQueueIndex === index || (touchDragIndex !== null && touchOverIndex === index);

                      return (
                        <div
                          key={`${track.id}-q-${index}`}
                          data-queue-index={index}
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
                          className={[
                            "group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition select-none",
                            isCurrent ? "bg-white/[0.07]" : "hover:bg-white/[0.045] active:bg-white/[0.07]",
                            isDragging ? "opacity-30 scale-95" : "opacity-100",
                            isDragOver ? "border-2 border-[#8341EF]" : "border border-transparent"
                          ].join(" ")}
                        >
                          {/* Track Menu Button */}
                          <TrackMenuButton
                            track={track}
                            onOpenArtist={(artist) => {
                              onClose?.();
                              onOpenArtist?.(artist);
                            }}
                            onOpenAlbum={(album) => {
                              onClose?.();
                              onOpenAlbum?.(album);
                            }}
                          />

                          {/* Cover */}
                          <img src={track.cover || "/logo.png"} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover bg-white/[0.04]" />

                          {/* Title & Artist */}
                          <div
                            onClick={() => playTrack(track, queue)}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <p className="truncate text-sm font-black text-white">{track.title}</p>
                            <p className="truncate text-xs font-semibold text-white/35">{track.artist}</p>
                          </div>

                          {/* Drag handle */}
                          <div
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              handleTouchStartQueue(index);
                            }}
                            onTouchMove={handleTouchMoveQueue}
                            onTouchEnd={handleTouchEndQueue}
                            className="grid h-8 w-8 shrink-0 place-items-center text-white/25 hover:text-white/70 cursor-grab active:cursor-grabbing transition touch-none"
                            title="Перетащить для изменения порядка"
                          >
                            <svg className="h-5 w-5 fill-current pointer-events-none" viewBox="0 0 24 24">
                              <path d="M4 15h16v-2H4v2zm0 4h16v-2H4v2zm0-8h16V9H4v2zm0-6v2h16V5H4z" />
                            </svg>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs font-semibold text-white/30">
                      Очередь пустая
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>
        )}
      </div>
    );
  }

  const isDesktopTextOnly = shouldShowLyricsPanel && lyricsSettings.displayMode === "text-only";
  const leftPanelClass = isDesktopTextOnly
    ? "w-0 p-0 opacity-0 pointer-events-none scale-95 border-none min-w-0"
    : (shouldShowSidePanel ? "w-1/2 p-8 max-md:w-full max-sm:p-4 opacity-100 scale-100 min-w-0" : "w-full p-8 max-sm:p-4 opacity-100 scale-100 min-w-0");

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setLyricsContextMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`fixed inset-0 z-50 flex select-none text-white bg-[#090909] transition-opacity duration-300 ease-out [&_*::selection]:bg-[var(--selection-bg)] [&_*::selection]:text-white ${
        isVisible && !isClosing ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{
        "--player-accent": `color-mix(in srgb, ${trackPalette.line} 50%, #4a4a4a)`,
        "--selection-bg": `color-mix(in srgb, ${trackPalette.line} 50%, rgba(255,255,255,0.2))`
      }}
    >
      {/* Blurred Cover background matching ArtistView banner */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 opacity-65 blur-[100px] scale-125">
          <img
            src={coverUrl}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.png"; }}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#090909]/75 to-[#090909]" />
      </div>

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

      <div className={`relative z-10 flex flex-col items-center justify-center transition-all duration-500 ease-in-out ${leftPanelClass}`}>
        <div
          key={currentTrack?.id}
          className={`flex flex-col items-center gap-4 transition-all duration-300 ease-out ${slideClass.current} ${isVisible && !isClosing ? "translate-y-0 scale-100" : "translate-y-4 scale-95"
            }`}
        >
          <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative aspect-square w-[min(100%,_50vh)] md:w-[min(100%,_55vh)] lg:w-[min(600px,_65vh)] cursor-pointer rounded-2xl shadow-2xl transition-all duration-500 ease-out"
            style={{ boxShadow: "0 30px 90px rgba(0,0,0,.62)" }}
          >
            <img src={coverUrl} alt={currentTrack?.title || ""} className="h-full w-full object-cover rounded-2xl" />

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

          <div className="text-center w-80 lg:w-[600px] max-sm:w-64 max-xs:w-52 transition-all duration-500">
            <h2 className="text-base lg:text-xl font-bold text-white">{currentTrack?.title}</h2>
            <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-1.5 overflow-hidden text-xs lg:text-sm font-semibold text-white/60">
              {getTrackArtists(currentTrack).map((artist, index) => {
                return (
                  <React.Fragment key={`${artist.id || artist.name}-${index}`}>
                    {index > 0 && <span className="mx-0.5 font-light text-white/35">×</span>}
                    <button
                      type="button"
                      onClick={() => handleArtistClick(artist)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 transition hover:bg-white/15 hover:text-white group/artist"
                    >
                      <OverlayArtistAvatar artist={artist} track={currentTrack} />
                      <span>{artist.name || artist.username}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="w-[min(100%,_600px)] max-sm:w-[min(100%,_256px)] max-xs:w-[min(100%,_208px)] transition-all duration-500">
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
        className={`relative z-10 flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ease-in-out ${
          isDesktopTextOnly 
            ? "w-full scale-100 opacity-100" 
            : (shouldShowSidePanel ? "w-1/2 max-md:w-full scale-100 opacity-100" : "pointer-events-none w-0 scale-95 opacity-0")
          }`}
      >
        {isDesktopTextOnly && (
          <div className="absolute top-12 left-0 right-0 z-20 flex flex-col items-center justify-center pointer-events-none animate-in fade-in slide-in-from-top-4 zoom-in-95 duration-500 ease-out">
            <div 
              className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-3xl px-4 py-2.5 rounded-[20px] shadow-2xl pointer-events-auto cursor-pointer transition hover:bg-white/[0.08]" 
              onClick={() => setSidePanel("none")}
              title="Закрыть текст"
            >
              <img src={coverUrl} className="w-11 h-11 rounded-[10px] object-cover shadow-lg" alt="" />
              <div className="flex flex-col justify-center max-w-[200px] text-left">
                <span className="text-[14px] font-black text-white leading-tight truncate">{currentTrack?.title}</span>
                <div className="flex items-center gap-1.5 opacity-60 mt-0.5">
                  <OverlayArtistAvatar artist={{ name: currentTrack?.artist }} track={currentTrack} size="h-4 w-4" />
                  <span className="text-[12px] font-bold truncate leading-tight">{currentTrack?.artist}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {shouldShowQueuePanel ? (
          renderQueue()
        ) : shouldShowLyricsPanel ? (
          renderLyricsContent(false)
        ) : null}
      </div>

      {/* Lyrics Context Menu */}
      {lyricsContextMenu && (
        <LyricsContextMenu
          x={lyricsContextMenu.x}
          y={lyricsContextMenu.y}
          hasLyrics={lyricsState.status !== "empty" && lyricsState.lines?.length > 0}
          isLoading={lyricsState.status === "loading"}
          isKaraokeAvailable={lyricsState.status === "synced"}
          onClose={() => setLyricsContextMenu(null)}
          settings={lyricsSettings}
          onUpdateSettings={(newSettings) => {
            const nextSettings = { ...profileSettings, lyricsSettings: { ...lyricsSettings, ...newSettings } };
            setProfileSettings(nextSettings);
            saveProfileSettings(nextSettings, true);
          }}
          offset={lyricsUserOffset}
          onUpdateOffset={handleUpdateLyricsOffset}
          activeDisplayMode={shouldShowSidePanel ? lyricsSettings.displayMode : "hidden"}
          onShowText={() => {
            setSidePanel("lyrics");
            setShowLyrics(true);
          }}
          onHideText={() => {
            setShowLyrics(false);
            setLyricsContextMenu(null);
          }}
          onReloadLyrics={handleReloadLyrics}
        />
      )}
    </div>
  );
}
