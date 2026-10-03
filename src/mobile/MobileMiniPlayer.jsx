import React, { useRef } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";

/**
 * Mobile-only presentation of the existing audio player state.
 * Playback remains owned by AudioPlayerContext; this component only exposes
 * the controls that fit comfortably above the floating navigation dock.
 */
export function MobileMiniPlayer({ onOpenFull }) {
  const { currentTrack, isPlaying, isLoading, togglePlay, previous, next } = useAudioPlayer();
  const hasTrack = Boolean(currentTrack && currentTrack.id !== "empty");
  const swipeRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef(null);

  const handleTouchStart = (event) => {
    if (!event.touches || event.touches.length !== 1) return;
    const touch = event.touches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (event) => {
    if (!swipeRef.current || !event.changedTouches?.length) return;
    const start = swipeRef.current;
    const touch = event.changedTouches[0];
    swipeRef.current = null;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;

    if (elapsed > 700 || Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2 || !hasTrack) return;

    // Mobile convention for AmyMusic: left = previous, right = next.
    if (deltaX < 0) previous();
    else next();

    suppressClickRef.current = true;
    clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 450);
  };

  const handleClickAfterSwipe = (event, action) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      clearTimeout(suppressClickTimerRef.current);
      return;
    }
    action();
  };

  return (
    <section
      className="mobile-mini-player"
      aria-label="Мини-плеер"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        className="mobile-mini-player__track"
        onClick={(event) => handleClickAfterSwipe(event, onOpenFull)}
        aria-label={hasTrack ? `Открыть плеер: ${currentTrack.title || "Без названия"}` : "Открыть полный плеер"}
      >
        <img
          className="mobile-mini-player__cover"
          src={hasTrack ? currentTrack.cover || "/logo.png" : "/logo.png"}
          alt=""
          onError={(event) => {
            event.currentTarget.src = "/logo.png";
          }}
        />
        <span className="mobile-mini-player__meta">
          <span className="mobile-mini-player__title">{hasTrack ? currentTrack.title || "Без названия" : "Нет трека"}</span>
          <span className="mobile-mini-player__artist">{hasTrack ? currentTrack.artist || "Неизвестный артист" : "Трек не загружен"}</span>
        </span>
      </button>

      <button
        type="button"
        className="mobile-mini-player__play"
        onClick={(event) => handleClickAfterSwipe(event, hasTrack ? togglePlay : onOpenFull)}
        aria-label={hasTrack ? (isPlaying ? "Пауза" : "Воспроизвести") : "Открыть полный плеер"}
      >
        {isLoading ? (
          <span className="mobile-mini-player__spinner" aria-hidden="true" />
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
        )}
      </button>
    </section>
  );
}

