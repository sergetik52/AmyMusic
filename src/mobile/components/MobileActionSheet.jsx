import React, { useEffect } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";

export function MobileActionSheet({ track, isOpen, onClose, onOpenArtist, onOpenAlbum }) {
  const {
    likedTrackIds,
    toggleLike,
    playNext,
    addToQueue,
    isDisliked,
    toggleDislike
  } = useAudioPlayer();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !track) return null;

  const isLiked = likedTrackIds.has(track.id);
  const isTrackDisliked = isDisliked?.(track.id);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${track.title} - ${track.artist}`,
          text: `Слушай ${track.title} в AmyMusic`,
          url: track.permalinkUrl || window.location.href
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(track.permalinkUrl || window.location.href);
      } catch {}
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        className="ios-blur-sheet w-full rounded-t-[28px] border-t border-white/10 p-5 pb-safe animate-slide-up"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 16px, 24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

        {/* Track header preview */}
        <div className="flex items-center gap-3.5 border-b border-white/10 pb-4">
          <img
            src={track.cover || "/logo.png"}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-white">{track.title}</h3>
            <p className="truncate text-xs font-semibold text-white/50">{track.artist}</p>
          </div>
        </div>

        {/* Action list */}
        <div className="mt-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              toggleLike(track.id, track);
              onClose();
            }}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
          >
            <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className="h-5 w-5" />
            <span>{isLiked ? "Удалить из любимых" : "Добавить в любимые"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playNext(track);
              onClose();
            }}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
          >
            <svg className="h-5 w-5 fill-white/80" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            <span>Слушать следующим</span>
          </button>

          <button
            type="button"
            onClick={() => {
              addToQueue(track);
              onClose();
            }}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
          >
            <svg className="h-5 w-5 fill-white/80" viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg>
            <span>Добавить в конец очереди</span>
          </button>

          {onOpenArtist && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenArtist({
                  id: track.artistId || "",
                  name: track.artist,
                  username: track.artist,
                  avatar: track.artistAvatar || track.cover || "/user.svg"
                });
              }}
              className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
            >
              <svg className="h-5 w-5 fill-white/80" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
              <span>Перейти к артисту</span>
            </button>
          )}

          {track.albumId && onOpenAlbum && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAlbum({ id: track.albumId, title: track.albumTitle || track.title, cover: track.cover });
              }}
              className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
            >
              <svg className="h-5 w-5 fill-white/80" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" /></svg>
              <span>Перейти к альбому</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-sm font-semibold text-white transition active:bg-white/10"
          >
            <svg className="h-5 w-5 fill-white/80" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" /></svg>
            <span>Поделиться</span>
          </button>
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-white/10 py-3.5 text-center text-sm font-bold text-white transition active:bg-white/20"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
