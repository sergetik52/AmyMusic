import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";

export function TrackContextMenu({
  track,
  onClose,
  onOpenArtist,
  onOpenAlbum,
  placement = "bottom"
}) {
  const {
    likedTrackIds,
    toggleLike,
    dislikedTrackIds,
    toggleDislike,
    openTrackWave,
    playNext,
    addToQueueEnd,
    userPlaylists,
    addTrackToUserPlaylist,
    setIsFullOpen
  } = useAudioPlayer();

  const menuRef = useRef(null);
  const subTimerRef = useRef(null);
  const isLiked = likedTrackIds.has(track.id);
  const isDisliked = dislikedTrackIds.has(track.id);
  const [isSubOpen, setIsSubOpen] = useState(false);

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
    const albumObj = track.album || track.release;
    if (albumObj) {
      onOpenAlbum?.(albumObj);
    } else {
      if (track.playlistId) {
        onOpenAlbum?.({ id: track.playlistId, title: track.playlistTitle || "Альбом", cover: track.cover });
      }
    }
  };

  const hasAlbum = Boolean(track.album || track.release || track.playlistId);

  return (
    <div
      ref={menuRef}
      className={`absolute right-0 z-[100] w-56 rounded-2xl border border-white/10 bg-[#161616]/95 py-2 text-white shadow-2xl backdrop-blur-md animate-slide-up-fade pointer-events-auto ${
        placement === "top" ? "bottom-full mb-2" : "top-full mt-1"
      }`}
      style={{
        boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
      }}
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
            className={`absolute left-full w-56 rounded-2xl border border-white/10 bg-[#161616]/95 py-2 text-white shadow-2xl backdrop-blur-md pointer-events-auto animate-slide-up-fade ${
              placement === "top" ? "bottom-0" : "top-0"
            }`}
            style={{
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              marginLeft: "0px"
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
        <span>Перейти к альбому</span>
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
    </div>
  );
}

export function TrackMenuButton({
  track,
  onOpenArtist,
  onOpenAlbum,
  placement = "bottom"
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
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
          placement={placement}
        />
      )}
    </div>
  );
}
