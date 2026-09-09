import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export function TrackContextMenu({
  track,
  onClose,
  onOpenArtist,
  onOpenAlbum,
  onShareTrack,
  onRemoveFromPlaylist,
  onRemoveFromQueue,
  placement = "bottom",
  positionStyle = null
}) {
  const isMobile = useIsMobile();
  const {
    likedTrackIds,
    toggleLike,
    dislikedTrackIds,
    toggleDislike,
    openTrackWave,
    playNext,
    addToQueueEnd,
    removeFromQueue,
    userPlaylists,
    addTrackToUserPlaylist,
    setIsFullOpen
  } = useAudioPlayer();

  const menuRef = useRef(null);
  const subTimerRef = useRef(null);
  const isLiked = likedTrackIds.has(track.id);
  const isDisliked = dislikedTrackIds.has(track.id);
  const [isSubOpen, setIsSubOpen] = useState(false);
  const [actualPlacement, setActualPlacement] = useState(placement);
  const [subPlacementLeft, setSubPlacementLeft] = useState(false);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    if (rect.bottom > windowHeight - 12 && rect.top > 300) {
      setActualPlacement("top");
    } else if (rect.top < 10) {
      setActualPlacement("bottom");
    }

    if (rect.right + 230 > windowWidth - 10) {
      setSubPlacementLeft(true);
    } else {
      setSubPlacementLeft(false);
    }
  }, [placement]);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(subTimerRef.current);
  }, []);

  const openSub = useCallback(() => {
    clearTimeout(subTimerRef.current);
    setIsSubOpen(true);
  }, []);

  const closeSub = useCallback(() => {
    subTimerRef.current = setTimeout(() => setIsSubOpen(false), 150);
  }, []);

  const handleAction = (actionFn) => {
    actionFn();
    onClose();
  };

  const handleOpenArtist = () => {
    if (!track.artist) return;
    onOpenArtist?.({
      id: track.artistId || "",
      name: track.artist,
      username: track.artist,
      avatar: track.artistAvatar || track.cover || "/logo.png",
      permalinkUrl: track.artistPermalinkUrl || ""
    });
  };

  const handleOpenAlbum = () => {
    let albumObj = track.album || track.release;
    if (!albumObj && track.playlistId) {
      albumObj = { id: track.playlistId, title: track.playlistTitle || "Альбом", cover: track.cover };
    }

    if (albumObj) {
      onOpenAlbum?.(albumObj);
    } else {
      onOpenAlbum?.({
        id: `single-${track.id}`,
        title: track.title,
        kind: "single",
        artist: track.artist,
        artistId: track.artistId,
        artistAvatar: track.artistAvatar || track.cover,
        cover: track.cover,
        trackCount: 1,
        tracks: [track]
      });
    }
  };

  const hasAlbum = true;

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-xl animate-[fadeIn_0.2s_ease-out] pointer-events-auto"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <div
          ref={menuRef}
          className="w-full max-h-[85vh] overflow-y-auto rounded-t-[24px] border-t border-white/10 bg-[#161616]/95 p-4 pb-10 text-white shadow-2xl backdrop-blur-2xl animate-bottom-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pull handle bar */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

          {/* Track header preview */}
          <div className="mb-3 flex items-center gap-3 border-b border-white/[0.08] pb-3">
            <img src={track.cover} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold text-white">{track.title}</span>
              <span className="truncate text-xs font-medium text-white/40">{track.artist}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => handleAction(() => toggleLike(track.id, track))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/like.svg" alt="" className={`h-5 w-5 shrink-0 ${isLiked ? "text-purple-500" : "opacity-60"}`} />
              <span>{isLiked ? "Удалить из Любимых" : "Нравится"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction(() => openTrackWave(track))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/my-wave-of-track.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>Моя волна по треку</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction(() => playNext(track))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/next-of-queue.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>Играть следующим</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction(() => addToQueueEnd(track))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/end-of-queue.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>Добавить в конец очереди</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction(() => toggleDislike(track.id, track))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/dislike.svg" alt="" className={`h-5 w-5 shrink-0 ${isDisliked ? "text-purple-500" : "opacity-60"}`} />
              <span>{isDisliked ? "Дизлайк отменен" : "Не нравится"}</span>
            </button>

            <div>
              <button
                type="button"
                onClick={() => setIsSubOpen(!isSubOpen)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
              >
                <div className="flex items-center gap-3.5">
                  <img src="/menu/playlist.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
                  <span>Добавить в плейлист</span>
                </div>
                <span className={`text-xs text-white/40 transition-transform duration-200 ${isSubOpen ? "rotate-90" : ""}`}>›</span>
              </button>

              {isSubOpen && (
                <div className="ml-4 my-1 space-y-1 border-l-2 border-white/10 pl-3 py-1">
                  {userPlaylists.length > 0 ? (
                    userPlaylists.map((playlist) => (
                      <button
                        key={playlist.id}
                        onClick={() => handleAction(() => addTrackToUserPlaylist(playlist.id, track))}
                        className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10"
                      >
                        <span className="truncate">{playlist.title}</span>
                      </button>
                    ))
                  ) : (
                    <span className="block px-3 py-2 text-xs font-bold text-white/30 italic">
                      Нет плейлистов
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleAction(() => setIsFullOpen(true))}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/lyrics.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>Показать текст песни</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction(handleOpenAlbum)}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15"
            >
              <img src="/menu/album.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>{track.album || track.release ? "Перейти к альбому" : "Перейти к синглу"}</span>
            </button>

            <button
              type="button"
              disabled={!track.artist}
              onClick={() => handleAction(handleOpenArtist)}
              className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-white/90 transition hover:bg-white/10 active:bg-white/15 disabled:opacity-30"
            >
              <img src="/menu/artist.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
              <span>Перейти к исполнителю</span>
            </button>

            {onRemoveFromQueue && (
              <button
                type="button"
                onClick={() => handleAction(onRemoveFromQueue)}
                className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-red-400 transition hover:bg-red-500/10 active:bg-red-500/20"
              >
                <img src="/menu/delete.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
                <span>Удалить из очереди</span>
              </button>
            )}

            {onRemoveFromPlaylist && (
              <button
                type="button"
                onClick={() => handleAction(onRemoveFromPlaylist)}
                className="flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-sm font-bold text-red-400 transition hover:bg-red-500/10 active:bg-red-500/20"
              >
                <img src="/menu/delete.svg" alt="" className="h-5 w-5 shrink-0 opacity-60" />
                <span>Удалить из плейлиста</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className={`z-[100] w-56 rounded-2xl border border-white/10 bg-[#161616]/95 py-2 text-white shadow-2xl backdrop-blur-md animate-slide-up-fade pointer-events-auto ${
        positionStyle
          ? "fixed"
          : `absolute right-0 ${actualPlacement === "top" ? "bottom-full mb-2" : "top-full mt-1"}`
      }`}
      style={
        positionStyle || {
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
        }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Нравится */}
      <button
        type="button"
        onClick={() => handleAction(() => toggleLike(track.id, track))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/like.svg" alt="" className={`h-4.5 w-4.5 shrink-0 ${isLiked ? "text-purple-500" : "opacity-60"}`} />
        <span>{isLiked ? "Удалить из Любимых" : "Нравится"}</span>
      </button>

      {/* 2. Моя волна по треку */}
      <button
        type="button"
        onClick={() => handleAction(() => openTrackWave(track))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/my-wave-of-track.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>Моя волна по треку</span>
      </button>

      {/* 3. Играть следующим */}
      <button
        type="button"
        onClick={() => handleAction(() => playNext(track))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/next-of-queue.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>Играть следующим</span>
      </button>

      {/* 4. Добавить в конец очереди */}
      <button
        type="button"
        onClick={() => handleAction(() => addToQueueEnd(track))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/end-of-queue.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>Добавить в конец очереди</span>
      </button>

      {/* 5. Не нравится */}
      <button
        type="button"
        onClick={() => handleAction(() => toggleDislike(track.id, track))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/dislike.svg" alt="" className={`h-4.5 w-4.5 shrink-0 ${isDisliked ? "text-purple-500" : "opacity-60"}`} />
        <span>{isDisliked ? "Дизлайк отменен" : "Не нравится"}</span>
      </button>

      {/* 6. Добавить в плейлист */}
      <div
        className="relative"
        onMouseEnter={openSub}
        onMouseLeave={closeSub}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsSubOpen(!isSubOpen);
          }}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <div className="flex items-center gap-3">
            <img src="/menu/playlist.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
            <span>Добавить в плейлист</span>
          </div>
          <span className="text-[10px] text-white/40">›</span>
        </button>

        {/* Submenu */}
        {isSubOpen && (
          <div
            className={`absolute w-56 rounded-2xl border border-white/10 bg-[#161616]/95 py-2 text-white shadow-2xl backdrop-blur-md pointer-events-auto animate-slide-up-fade ${
              subPlacementLeft ? "right-full mr-1" : "left-full ml-1"
            } ${actualPlacement === "top" ? "bottom-0" : "top-0"}`}
            style={{
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
            }}
            onMouseEnter={openSub}
            onMouseLeave={closeSub}
          >
            <div className="px-4 py-1.5 text-[9px] font-black uppercase tracking-wider text-white/30 border-b border-white/[0.04] mb-1">
              Мои плейлисты
            </div>
            <div className="max-h-48 overflow-y-auto">
              {userPlaylists.length > 0 ? (
                userPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handleAction(() => addTrackToUserPlaylist(playlist.id, track))}
                    className="flex w-full items-center px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="truncate">{playlist.title}</span>
                  </button>
                ))
              ) : (
                <span className="block px-4 py-2.5 text-xs font-bold text-white/30 italic">
                  Нет плейлистов
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 7. Показать текст песни */}
      <button
        type="button"
        onClick={() => handleAction(() => setIsFullOpen(true))}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <img src="/menu/lyrics.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>Показать текст песни</span>
      </button>

      {/* 8. Перейти к альбому */}
      <button
        type="button"
        disabled={!hasAlbum}
        onClick={() => handleAction(handleOpenAlbum)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
      >
        <img src="/menu/album.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>{track.album || track.release ? "Перейти к альбому" : "Перейти к синглу"}</span>
      </button>

      {/* 9. Перейти к исполнителю */}
      <button
        type="button"
        disabled={!track.artist}
        onClick={() => handleAction(handleOpenArtist)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
      >
        <img src="/menu/artist.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
        <span>Перейти к исполнителю</span>
      </button>

      {/* 10. Удалить из очереди */}
      {onRemoveFromQueue && (
        <>
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            type="button"
            onClick={() => handleAction(onRemoveFromQueue)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <img src="/menu/delete.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
            <span>Удалить из очереди</span>
          </button>
        </>
      )}

      {/* 11. Удалить из плейлиста (optional) */}
      {onRemoveFromPlaylist && (
        <>
          <div className="my-1 border-t border-white/[0.06]" />
          <button
            type="button"
            onClick={() => handleAction(onRemoveFromPlaylist)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-bold text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <img src="/menu/delete.svg" alt="" className="h-4.5 w-4.5 shrink-0 opacity-60" />
            <span>Удалить из плейлиста</span>
          </button>
        </>
      )}
    </div>
  );
}

export function TrackMenuButton({
  track,
  onOpenArtist,
  onOpenAlbum,
  onShareTrack,
  onRemoveFromPlaylist,
  placement = "bottom"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef(null);

  useEffect(() => {
    return () => clearTimeout(closeTimer.current);
  }, []);

  const handleEnter = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);

  const handleLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setIsOpen(false), 200);
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          clearTimeout(closeTimer.current);
          setIsOpen(!isOpen);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition active:scale-95"
        aria-label="Меню трека"
      >
        <img src="/menu/menu-item.svg" alt="Menu" className="h-5 w-5 brightness-200 opacity-60 hover:opacity-100 transition" />
      </button>

      {isOpen && (
        <TrackContextMenu
          track={track}
          onClose={() => setIsOpen(false)}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onShareTrack={onShareTrack}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          placement={placement}
        />
      )}
    </div>
  );
}
