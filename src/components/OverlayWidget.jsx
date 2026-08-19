import React, { useState, useEffect } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { fetchLyricsForTrack } from "../services/lyricsApi";
import { Mic, Play, Pause, SkipBack, SkipForward, Heart, X, Move, Sparkles } from "lucide-react";

export function OverlayWidget() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    togglePlay,
    previous,
    next,
    toggleLike,
    isLiked
  } = useAudioPlayer();

  const [showKaraoke, setShowKaraoke] = useState(false);
  const [lyricsState, setLyricsState] = useState({ status: "idle", lines: [] });
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  // Auto-resize overlay window depending on karaoke toggle
  useEffect(() => {
    if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlay) {
      if (showKaraoke) {
        window.amyMusicDesktop.resizeOverlay(380, 400);
      } else {
        window.amyMusicDesktop.resizeOverlay(360, 140);
      }
    }
  }, [showKaraoke]);

  // Fetch lyrics when track changes and karaoke is active
  useEffect(() => {
    if (!currentTrack?.id || currentTrack.id === "empty") return;

    let isMounted = true;
    setLyricsState({ status: "loading", lines: [] });

    fetchLyricsForTrack(currentTrack).then((res) => {
      if (!isMounted) return;
      setLyricsState(res || { status: "none", lines: [] });
    }).catch(() => {
      if (isMounted) setLyricsState({ status: "none", lines: [] });
    });

    return () => {
      isMounted = false;
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist]);

  // Update active karaoke lyrics line based on currentTime
  useEffect(() => {
    if (lyricsState.status !== "synced" || !lyricsState.lines.length) return;
    const index = lyricsState.lines.findIndex((line, i) => {
      const nextLine = lyricsState.lines[i + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });
    if (index !== -1 && index !== activeLineIndex) {
      setActiveLineIndex(index);
    }
  }, [currentTime, lyricsState, activeLineIndex]);

  const activeLine = lyricsState.lines[activeLineIndex];

  return (
    <div className="h-screen w-screen p-2 flex flex-col justify-between overflow-hidden bg-[#0A0A0C]/95 border border-[#FFCC00]/20 rounded-3xl backdrop-blur-2xl text-white shadow-[0_10px_40px_rgba(0,0,0,0.8)] select-none animate-fade-in">
      
      {/* DRAGGABLE HEADER BAR */}
      <div 
        className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08]"
        style={{ WebkitAppRegion: "drag" }}
      >
        <div className="flex items-center gap-2 text-white/40">
          <Move className="h-3.5 w-3.5" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FFCC00]">
            AmyMusic Overlay
          </span>
        </div>

        {/* CONTROLS (NO DRAG) */}
        <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" }}>
          {/* KARAOKE / LYRICS TOGGLE BUTTON */}
          <button
            type="button"
            onClick={() => setShowKaraoke(!showKaraoke)}
            title={showKaraoke ? "Выключить караоке" : "Включить караоке"}
            className={`flex h-7 px-2.5 items-center gap-1 rounded-full text-[11px] font-bold transition ${
              showKaraoke 
                ? "bg-[#FFCC00] text-black shadow-[0_0_15px_rgba(255,204,0,0.4)]" 
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Караоке</span>
          </button>

          {/* CLOSE OVERLAY BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (window.amyMusicDesktop?.toggleOverlay) {
                window.amyMusicDesktop.toggleOverlay();
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* TRACK INFO & PLAYER CONTROLS */}
      <div className="flex items-center gap-3 px-3 py-2">
        <img
          src={currentTrack.cover || "/logo.png"}
          alt=""
          className="h-12 w-12 rounded-2xl object-cover shrink-0 border border-white/10 shadow-lg"
        />

        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-black text-white truncate leading-tight">
            {currentTrack.title || "Нет трека"}
          </h4>
          <p className="text-[11px] font-semibold text-white/50 truncate mt-0.5">
            {currentTrack.artist || "AmyMusic"}
          </p>
        </div>

        {/* MEDIA ACTION BUTTONS */}
        <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: "no-drag" }}>
          <button
            type="button"
            onClick={previous}
            className="p-1.5 text-white/60 hover:text-white transition active:scale-95"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFCC00] text-black shadow-[0_0_15px_rgba(255,204,0,0.3)] transition hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={next}
            className="p-1.5 text-white/60 hover:text-white transition active:scale-95"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => toggleLike()}
            className={`p-1.5 transition active:scale-95 ${isLiked ? "text-purple-400" : "text-white/40 hover:text-white"}`}
          >
            <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>

      {/* KARAOKE / LYRICS PANEL (WHEN EXPANDED) */}
      {showKaraoke && (
        <div className="flex-1 border-t border-white/[0.08] p-3 flex flex-col justify-center text-center overflow-hidden animate-fade-in">
          {lyricsState.status === "loading" ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#FFCC00]">
              <Sparkles className="h-4 w-4 animate-spin" />
              <span>Поиск текста...</span>
            </div>
          ) : lyricsState.lines.length > 0 ? (
            <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-none px-2">
              {lyricsState.lines.slice(Math.max(0, activeLineIndex - 2), activeLineIndex + 4).map((line, idx) => {
                const isActive = line.text === activeLine?.text;
                return (
                  <p
                    key={`${idx}-${line.time}`}
                    className={`text-sm font-black transition-all duration-300 ${
                      isActive
                        ? "text-[#FFCC00] scale-105 drop-shadow-[0_0_12px_rgba(255,204,0,0.5)]"
                        : "text-white/30 text-xs font-bold"
                    }`}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="text-xs font-semibold text-white/40">
              Текст песни не найден
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default OverlayWidget;
