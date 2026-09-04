import React, { useState } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";

const WAVE_PRESETS = [
  { id: "all", label: "Все подряд", icon: "✨" },
  { id: "energetic", label: "Бодрое", icon: "⚡" },
  { id: "calm", label: "Спокойное", icon: "🌙" },
  { id: "happy", label: "Весёлое", icon: "☀️" },
  { id: "focus", label: "Для работы", icon: "🎧" }
];

export function MobileWaveView({ onOpenFullPlayer }) {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playNextTrack,
    likedTrackIds,
    toggleLike,
    isDisliked,
    toggleDislike,
    audioEnergy
  } = useAudioPlayer();

  const [activePreset, setActivePreset] = useState("all");

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;
  const energyScale = 1 + (audioEnergy?.bass || 0) * 0.25;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between px-6 pb-28 pt-4 text-white overflow-hidden">
      {/* Mood Filters */}
      <div className="z-10 flex w-full gap-2 overflow-x-auto pb-2 mobile-scroll-container">
        {WAVE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePreset(p.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition active:scale-95 ${
              activePreset === p.id
                ? "bg-white text-black shadow-lg"
                : "bg-white/10 text-white/70 hover:text-white"
            }`}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Central Pulsing Wave Sphere */}
      <div className="relative my-auto flex flex-col items-center justify-center">
        {/* Ambient background glow */}
        <div
          className="absolute h-64 w-64 rounded-full bg-[var(--player-accent,#a855f7)]/25 blur-3xl transition-all duration-300 pointer-events-none"
          style={{ transform: `scale(${energyScale * 1.2})` }}
        />

        {/* Animated Sphere Container */}
        <div
          onClick={togglePlay}
          className="relative flex h-60 w-60 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-gradient-to-tr from-purple-900/60 via-pink-600/40 to-blue-600/40 p-3 shadow-2xl backdrop-blur-xl transition-transform duration-300 active:scale-95"
          style={{ transform: `scale(${energyScale})` }}
        >
          {/* Internal rotating waveform circle */}
          <div className="flex h-full w-full items-center justify-center rounded-full bg-black/40 border border-white/15">
            {currentTrack?.cover ? (
              <img
                src={currentTrack.cover}
                alt=""
                className={`h-28 w-28 rounded-full object-cover shadow-2xl transition duration-700 ${
                  isPlaying ? "rotate-animation" : ""
                }`}
              />
            ) : (
              <svg className="h-16 w-16 fill-white" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
            )}
          </div>

          {/* Floating Play/Pause Badge */}
          <div className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-xl">
            {isPlaying ? (
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg className="h-6 w-6 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </div>
        </div>
      </div>

      {/* Current Track Info & Action Controls */}
      {currentTrack ? (
        <div className="z-10 flex w-full flex-col items-center text-center">
          <div 
            onClick={onOpenFullPlayer} 
            className="cursor-pointer active:opacity-80 transition max-w-xs"
          >
            <h2 className="truncate text-lg font-black text-white">{currentTrack.title}</h2>
            <p className="truncate text-xs font-semibold text-white/50">{currentTrack.artist}</p>
          </div>

          {/* Actions: Dislike, Like, Next */}
          <div className="mt-4 flex items-center gap-6">
            <button
              type="button"
              onClick={() => toggleDislike?.(currentTrack.id, currentTrack)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/70 active:scale-90"
              aria-label="Дизлайк"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" /></svg>
            </button>

            <button
              type="button"
              onClick={() => toggleLike(currentTrack.id, currentTrack)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl active:scale-90"
              aria-label="Лайк"
            >
              <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={playNextTrack}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
              aria-label="Следующий трек"
            >
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center text-xs font-semibold text-white/40">Нажмите на сферу, чтобы включить волну</div>
      )}
    </div>
  );
}
