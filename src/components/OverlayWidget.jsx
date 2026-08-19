import React, { useState, useEffect } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { fetchLyricsForTrack } from "../services/lyricsApi";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function OverlayWidget() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    progress,
    togglePlay,
    previous,
    next,
    seek,
    toggleLike,
    isLiked
  } = useAudioPlayer();

  const [showKaraoke, setShowKaraoke] = useState(false);
  const [lyricsState, setLyricsState] = useState({ status: "idle", lines: [] });
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const hasLyrics = Boolean(lyricsState.lines && lyricsState.lines.length > 0);

  // Auto-disable karaoke if current track has no lyrics
  useEffect(() => {
    if (!hasLyrics && showKaraoke) {
      setShowKaraoke(false);
    }
  }, [hasLyrics]);

  // Auto-resize Electron overlay window depending on karaoke expansion
  useEffect(() => {
    if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlay) {
      if (showKaraoke && hasLyrics) {
        window.amyMusicDesktop.resizeOverlay(410, 360);
      } else {
        window.amyMusicDesktop.resizeOverlay(410, 230);
      }
    }
  }, [showKaraoke, hasLyrics]);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack?.id || currentTrack.id === "empty") return;

    let isMounted = true;
    setLyricsState({ status: "loading", lines: [] });

    fetchLyricsForTrack(currentTrack)
      .then((res) => {
        if (!isMounted) return;
        setLyricsState(res || { status: "none", lines: [] });
      })
      .catch(() => {
        if (!isMounted) setLyricsState({ status: "none", lines: [] });
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist]);

  // Sync active karaoke lyrics line
  useEffect(() => {
    if (!hasLyrics) return;
    const index = lyricsState.lines.findIndex((line, i) => {
      const nextLine = lyricsState.lines[i + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });
    if (index !== -1 && index !== activeLineIndex) {
      setActiveLineIndex(index);
    }
  }, [currentTime, lyricsState, activeLineIndex, hasLyrics]);

  const activeLine = lyricsState.lines[activeLineIndex];
  const percent = Math.min(100, Math.max(0, (progress || 0) * 100));

  const handleSeekClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    if (duration > 0) {
      seek(clickRatio * duration);
    }
  };

  return (
    <div className="h-screen w-screen p-2.5 flex items-center justify-center bg-transparent select-none">
      {/* MAIN GLASS PLAYER CONTAINER */}
      <div 
        className="w-full max-w-[400px] p-5 rounded-[24px] bg-white/[0.07] backdrop-blur-[28px] border border-white/12 shadow-[0_24px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] text-white flex flex-col gap-4 transition-all duration-400 cubic-bezier(0.16,1,0.3,1)"
      >
        
        {/* HEADER BAR (TRACK META + KARAOKE TOGGLE + CLOSE) */}
        <div 
          className="flex items-center justify-between gap-3"
          style={{ WebkitAppRegion: "drag" }}
        >
          {/* TRACK METADATA WITH ALBUM COVER */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src={currentTrack.cover || "/logo.png"}
              alt=""
              className="h-11 w-11 rounded-2xl object-cover shrink-0 border border-white/15 shadow-md"
            />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[15px] font-semibold tracking-tight text-white truncate leading-snug">
                {currentTrack.title || "Нет трека"}
              </span>
              <span className="text-[13px] text-white/55 font-normal truncate mt-0.5">
                {currentTrack.artist || "AmyMusic"}
              </span>
            </div>
          </div>

          {/* RIGHT ACTIONS: KARAOKE TOGGLE + CLOSE (NO DRAG) */}
          <div className="flex items-center gap-2.5 shrink-0" style={{ WebkitAppRegion: "no-drag" }}>
            {/* KARAOKE MIC + SWITCH */}
            <div 
              className={`flex items-center gap-2 transition-opacity ${!hasLyrics ? "opacity-30" : "opacity-100"}`}
              title={hasLyrics ? (showKaraoke ? "Выключить караоке" : "Включить караоке") : "Текст для караоке не найден"}
            >
              <svg 
                className="w-3.5 h-3.5 transition-colors duration-200"
                style={{ fill: hasLyrics && showKaraoke ? "#ffffff" : "rgba(255, 255, 255, 0.4)" }}
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>

              <label className="relative inline-block w-[38px] h-[22px]">
                <input 
                  type="checkbox"
                  disabled={!hasLyrics}
                  checked={showKaraoke && hasLyrics}
                  onChange={(e) => setShowKaraoke(e.target.checked)}
                  className="sr-only peer"
                />
                <span className="absolute inset-0 cursor-pointer rounded-full bg-white/12 border border-white/10 transition-all duration-300 peer-checked:bg-white/28 peer-checked:border-white/35 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                  <span className="absolute bottom-[2px] left-[2px] h-4 w-4 rounded-full bg-white/70 shadow-md transition-transform duration-300 peer-checked:translate-x-4 peer-checked:bg-white" />
                </span>
              </label>
            </div>

            {/* CLOSE BUTTON */}
            <button
              type="button"
              onClick={() => {
                if (window.amyMusicDesktop?.toggleOverlay) {
                  window.amyMusicDesktop.toggleOverlay();
                }
              }}
              title="Закрыть оверлей"
              className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* KARAOKE LYRICS CONTAINER (EXPANDABLE) */}
        {showKaraoke && hasLyrics && (
          <div className="max-h-[120px] overflow-hidden flex flex-col items-center justify-center gap-1.5 text-center py-1.5 animate-fade-in border-t border-b border-white/10">
            {lyricsState.lines.slice(Math.max(0, activeLineIndex - 1), activeLineIndex + 2).map((line, idx) => {
              const isActive = line.text === activeLine?.text;
              return (
                <p
                  key={`${idx}-${line.time}`}
                  className={`text-[13px] transition-all duration-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                    isActive
                      ? "text-base font-medium text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.2)]"
                      : "text-white/35 font-normal text-[12px]"
                  }`}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        )}

        {/* PROGRESS BAR SECTION */}
        <div className="flex flex-col gap-1.5" style={{ WebkitAppRegion: "no-drag" }}>
          <div 
            onClick={handleSeekClick}
            className="w-full h-1 bg-white/12 rounded-full cursor-pointer relative overflow-hidden group"
          >
            <div 
              className="absolute left-0 top-0 h-full bg-white/90 rounded-full transition-all duration-100"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-white/45 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* MEDIA CONTROLS */}
        <div className="flex justify-center items-center gap-5" style={{ WebkitAppRegion: "no-drag" }}>
          <button 
            type="button"
            onClick={previous}
            title="Предыдущий"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/8 rounded-full transition active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          <button 
            type="button"
            onClick={togglePlay}
            title="Воспроизведение / Пауза"
            className="w-[42px] h-[42px] rounded-full bg-white/15 text-white flex items-center justify-center transition hover:bg-white/25 hover:scale-105 active:scale-95 shadow-md"
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <button 
            type="button"
            onClick={next}
            title="Следующий"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/8 rounded-full transition active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>

          <button
            type="button"
            onClick={() => toggleLike()}
            title={isLiked ? "Удалить из любимых" : "В любимые"}
            className={`p-1.5 rounded-full transition active:scale-95 ${isLiked ? "text-purple-400" : "text-white/40 hover:text-white hover:bg-white/8"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}

export default OverlayWidget;
