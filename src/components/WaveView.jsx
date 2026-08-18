import React, { useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getPersonalWaveTracks, getWaveTracks } from "../services/soundCloudApi";

const dnaWavePaths = [
  "M -90 260 C 10 135 118 135 218 260 S 426 385 526 260 S 734 135 834 260 S 1042 385 1142 260 S 1350 135 1450 260",
  "M -90 260 C 10 385 118 385 218 260 S 426 135 526 260 S 734 385 834 260 S 1042 135 1142 260 S 1350 385 1450 260",
  "M -90 205 C 10 104 118 104 218 205 S 426 306 526 205 S 734 104 834 205 S 1042 306 1142 205 S 1350 104 1450 205",
  "M -90 315 C 10 416 118 416 218 315 S 426 214 526 315 S 734 416 834 315 S 1042 214 1142 315 S 1350 416 1450 315"
];

const dnaRungs = Array.from({ length: 30 }, (_, index) => {
  const x = -42 + index * 49;
  const angle = index * 0.62;
  const spread = 74 + Math.abs(Math.sin(angle)) * 58;
  const center = 260 + Math.sin(angle * 0.5) * 6;
  return {
    x,
    y1: center - Math.sin(angle) * spread,
    y2: center + Math.sin(angle) * spread,
    phase: Math.cos(angle) > 0 ? "front" : "back"
  };
});

function WaveField({ audioEnergy, isPlaying }) {
  const bass = isPlaying ? audioEnergy.bass : 0;
  const mids = isPlaying ? audioEnergy.mids : 0;
  const treble = isPlaying ? audioEnergy.treble : 0;
  const level = isPlaying ? audioEnergy.level : 0;

  return (
    <div className="song-wave-field" aria-hidden="true">
      <svg
        className="song-wave-svg"
        viewBox="0 0 1280 520"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="rough-wave-edge">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={isPlaying ? String(0.012 + treble * 0.028) : "0.01"}
              numOctaves="2"
              seed="8"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={isPlaying ? String(10 + bass * 44) : "8"}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter id="wave-glow">
            <feGaussianBlur stdDeviation={isPlaying ? "8" : "5"} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="song-dna-rungs song-dna-rungs-main">
          {dnaRungs.map((rung, index) => (
            <line
              key={`${rung.x}-${index}`}
              className={`song-dna-rung song-dna-rung-${rung.phase}`}
              x1={rung.x}
              y1={rung.y1}
              x2={rung.x + 28}
              y2={rung.y2}
            />
          ))}
        </g>

        <g className="song-dna-rungs song-dna-rungs-echo">
          {dnaRungs.map((rung, index) => (
            <line
              key={`echo-${rung.x}-${index}`}
              className={`song-dna-rung song-dna-rung-${rung.phase}`}
              x1={rung.x + 24}
              y1={rung.y1 - 55}
              x2={rung.x + 52}
              y2={rung.y2 - 55}
            />
          ))}
        </g>

        {dnaWavePaths.map((path, index) => (
          <path
            key={path}
            className={`song-wave-line song-wave-strand-${index + 1}`}
            d={path}
            pathLength="1000"
            style={{
              opacity: Math.min(1, 0.36 + level * 0.72 - index * 0.06),
              strokeWidth: 7 + bass * 18 + index * 1.4,
              transform: `translateY(${(index - 1.5) * mids * 18}px) scaleY(${1 + bass * 0.28})`
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function shuffleWaveTracks(tracks) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function WaveSeekBar({ currentTime, duration, progress, seek }) {
  const percent = Math.round((progress || 0) * 1000) / 10;

  return (
    <div className="flex w-full items-center gap-3 px-2">
      <span className="w-10 text-right text-[10px] font-semibold text-white/40">
        {formatTime(currentTime)}
      </span>
      <div className="player-seek-wrap relative h-5 flex-1">
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-[var(--cover-bright)] shadow-[0_0_18px_var(--cover-line)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(duration || 0, 1)}
          step="0.1"
          value={Math.min(currentTime || 0, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!duration}
          aria-label="Seek"
          className="player-seek-slider"
        />
      </div>
      <span className="w-10 text-[10px] font-semibold text-white/40">
        {formatTime(duration)}
      </span>
    </div>
  );
}

function WaveVolumeControl({ effectiveVolume, setVolume }) {
  const volumePercent = Math.round(effectiveVolume * 100);

  return (
    <div className="volume-control group relative grid h-11 w-11 shrink-0 place-items-center">
      <div className="volume-popover pointer-events-none absolute bottom-12 left-1/2 z-30 flex h-[238px] w-12 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/10 bg-[#171717]/95 py-3 opacity-0 shadow-2xl backdrop-blur-md transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div
          className="volume-live-fill pointer-events-none absolute left-1/2 w-[9px] -translate-x-1/2 rounded-full bg-[var(--player-accent-muted)]"
          style={{
            height: `${Math.max(12, effectiveVolume * 221)}px`,
            bottom: "8px"
          }}
        />
        <div
          className="volume-live-thumb pointer-events-none absolute left-1/2 h-[19px] w-[19px] -translate-x-1/2 rounded-full bg-[var(--player-accent)]"
          style={{
            bottom: `${8 + effectiveVolume * (221 - 19)}px`
          }}
        />
        <img
          src="/volume-input.svg"
          alt=""
          className="pointer-events-none absolute h-[221px] w-[19px] select-none opacity-70"
        />
        <input
          type="range"
          min="0"
          max="100"
          value={volumePercent}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          aria-label="Громкость"
          className="volume-slider"
        />
      </div>
      <button
        type="button"
        aria-label="Громкость"
        className="grid h-11 w-11 place-items-center rounded-full opacity-60 transition hover:bg-white/10 hover:opacity-100 active:scale-95 group-focus-within:bg-white/10 group-focus-within:opacity-100"
      >
        <img src={effectiveVolume > 0 ? "/volume-plus.svg" : "/volume-mute.svg"} alt="" className="h-5 w-5" />
      </button>
    </div>
  );
}

export function WaveView({ requestId: _requestId = 0, onOpenFull }) {
  const {
    currentTrack,
    trackPalette,
    audioEnergy,
    isPlaying,
    isLiked,
    isDisliked,
    isLoading,
    queue,
    currentIndex,
    currentTime,
    duration,
    progress,
    likedTracks,
    dislikedTrackIds,
    dislikedTracks,
    playHistory,
    effectiveVolume,
    togglePlay,
    previous,
    next,
    toggleLike,
    toggleDislike,
    playTrack,
    seek,
    setVolume,
    appendTracks
  } = useAudioPlayer();
  const [isLoadingWave, setIsLoadingWave] = useState(false);
  const [waveError, setWaveError] = useState("");
  const isAppendingWaveRef = useRef(false);
  // Rolling window of recently queued track IDs (last 80) to avoid immediate repeats
  // but not block tracks forever — old tracks can come back after ~80 new ones
  const recentWaveIdsRef = useRef(new Set());
  const palette = trackPalette || currentTrack.palette || {
    base: "#2a0a4a",
    line: "#9b5cff",
    bright: "#d8b4fe",
    shadow: "#4c1d95"
  };

  useEffect(() => {
    return undefined;
    // (dead code kept for structure, initial load handled by handleStartWave)
  }, [_requestId]);

  useEffect(() => {
    if (!isPlaying) return;
    if (!queue.length || isAppendingWaveRef.current) return;
    // Trigger when 12 or fewer tracks are left ahead in queue
    if (queue.length - currentIndex > 12) return;

    let isMounted = true;
    isAppendingWaveRef.current = true;

    async function appendMoreWaveTracks() {
      try {
        let tracks = await getPersonalWaveTracks({
          likedTracks,
          dislikedTrackIds,
          dislikedTracks,
          playHistory,
          currentTrack
        });

        if (!tracks.length) {
          tracks = await getWaveTracks("dark underground rap");
        }

        // Only exclude the rolling recent window, NOT the entire queue.
        // This lets tracks re-appear after ~80 new ones, keeping the wave infinite.
        const recentIds = recentWaveIdsRef.current;
        const nextTracks = shuffleWaveTracks(tracks).filter(
          (track) => !recentIds.has(String(track.id))
        );

        if (isMounted && nextTracks.length) {
          appendTracks(nextTracks);

          // Add newly queued IDs to the rolling window
          nextTracks.forEach((track) => recentIds.add(String(track.id)));

          // Keep the window bounded to ~80 entries: evict oldest when over limit
          if (recentIds.size > 80) {
            const entries = [...recentIds];
            entries.slice(0, entries.length - 80).forEach((id) => recentIds.delete(id));
          }
        }
      } catch (error) {
        if (isMounted) {
          setWaveError(error.message || "Не удалось догрузить Мою волну");
        }
      } finally {
        if (isMounted) {
          isAppendingWaveRef.current = false;
        }
      }
    }

    appendMoreWaveTracks();

    return () => {
      isMounted = false;
    };
  }, [
    appendTracks,
    currentIndex,
    currentTrack,
    dislikedTrackIds,
    isPlaying,
    likedTracks,
    playHistory,
    queue
  ]);

  const handleStartWave = async () => {
    if (isLoadingWave) return;

    setIsLoadingWave(true);
    setWaveError("");
    // Reset rolling window on fresh wave start
    recentWaveIdsRef.current = new Set();
    try {
      let tracks = await getPersonalWaveTracks({
        likedTracks,
        dislikedTrackIds,
        dislikedTracks,
        playHistory,
        currentTrack
      });

      if (!tracks.length) {
        tracks = await getWaveTracks("dark underground rap");
      }

      if (tracks.length) {
        const waveTracks = shuffleWaveTracks(tracks);
        // Seed the recent-IDs window so the first append batch doesn't repeat these
        waveTracks.forEach((track) => recentWaveIdsRef.current.add(String(track.id)));
        await playTrack(waveTracks[0], waveTracks);
      }
    } catch (error) {
      setWaveError(error.message || "Не удалось включить Мою волну");
    } finally {
      setIsLoadingWave(false);
    }
  };

  return (
    <section
      className={[
        "wave-screen relative flex flex-1 flex-col items-center justify-between overflow-hidden rounded-[17.76px] border border-white/[0.04] bg-[#090909] p-8 select-none",
        isPlaying ? "is-playing" : "is-paused"
      ].join(" ")}
      style={{
        "--cover-base": palette.base,
        "--cover-line": palette.line,
        "--cover-bright": palette.bright,
        "--cover-shadow": palette.shadow,
        "--player-accent": palette.line,
        "--player-accent-muted": palette.bright,
        "--audio-bass": audioEnergy.bass,
        "--audio-mids": audioEnergy.mids,
        "--audio-treble": audioEnergy.treble,
        "--audio-level": audioEnergy.level
      }}
    >
      <div className="song-wave-backdrop" />
      <WaveField audioEnergy={audioEnergy} isPlaying={isPlaying} />
      <div className="song-wave-vignette" />
      <button
        type="button"
        onClick={onOpenFull}
        className="song-cover overflow-hidden rounded-[28px] object-cover ring-1 ring-white/10"
        aria-label="Open full player"
      >
        <img src={currentTrack.cover} alt={currentTrack.title} className="h-full w-full object-cover" />
      </button>

      {waveError && (
        <p className="z-10 rounded-full bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200">
          {waveError}
        </p>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex -translate-y-10 items-center justify-center">
        {!isPlaying && (
          <button
            type="button"
            onClick={handleStartWave}
            disabled={isLoadingWave}
            className="wave-title-button pointer-events-auto relative text-7xl font-black tracking-tight text-transparent drop-shadow-[0_16px_34px_rgba(0,0,0,0.95)] transition hover:scale-[1.02] active:scale-[0.99] disabled:cursor-default disabled:opacity-55"
            aria-label="Включить Мою волну"
          >
            Моя волна
          </button>
        )}
      </div>

      <div className="absolute bottom-12 left-1/2 z-20 flex w-full max-w-lg -translate-x-1/2 flex-col items-center gap-6">
        <div className="grid min-h-[58px] w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:border-white/20 hover:bg-black/55">
          <span className="h-11 w-11" />
          <button
            type="button"
            onClick={onOpenFull}
            className="min-w-0 truncate text-center transition hover:text-white/85"
          >
            {currentTrack.title}
          </button>
          <WaveVolumeControl effectiveVolume={effectiveVolume} setVolume={setVolume} />
        </div>

        <WaveSeekBar
          currentTime={currentTime}
          duration={duration}
          progress={progress}
          seek={seek}
        />

        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => toggleDislike(currentTrack.id, currentTrack)}
            className="transition hover:opacity-100 active:scale-95 text-white"
          >
            <svg 
              className={`h-5 w-5 transition-colors ${isDisliked ? "fill-[#8341EF]" : "fill-white/50 opacity-60 hover:opacity-100"}`} 
              viewBox="0 0 24 22"
            >
              <path fillRule="evenodd" clipRule="evenodd" d="M17.8212 16.7055L21.081 19.4508L22.5105 17.7534L1.42948 0L0 1.69743L2.46855 3.77631C1.70961 4.89297 1.26953 6.33731 1.26953 8.06101C1.26953 11.9861 4.22921 14.5651 6.67973 16.5225C6.94981 16.7383 7.21387 16.9463 7.47062 17.1487C8.44852 17.9193 9.3203 18.6061 10.0123 19.3128C10.8831 20.2018 11.2558 20.9169 11.2558 21.5858H13.475C13.475 20.9169 13.8477 20.2018 14.7184 19.3128C15.4105 18.6061 16.2821 17.9192 17.26 17.1487C17.4435 17.0041 17.6308 16.8566 17.8212 16.7055ZM16.0882 15.2461L4.1805 5.21803C3.7654 5.91242 3.48871 6.84633 3.48871 8.06101C3.48871 10.7933 5.52215 12.7576 8.06476 14.7886C8.30011 14.9766 8.54083 15.1661 8.78332 15.357C9.77472 16.1373 10.7953 16.9407 11.5977 17.7599C11.8676 18.0356 12.1284 18.3278 12.3653 18.6383C12.6023 18.3278 12.8631 18.0356 13.133 17.7599C13.9355 16.9407 14.956 16.1373 15.9475 15.357C15.9944 15.32 16.0414 15.283 16.0882 15.2461ZM17.3352 1.23124C15.509 1.26961 13.7485 2.14104 12.5963 3.74083L14.3034 5.17015C15.0718 4.01573 16.262 3.47345 17.3818 3.44992C18.3427 3.42972 19.2908 3.78206 20.0004 4.5031C20.7027 5.21665 21.2421 6.36524 21.2421 8.06101C21.2421 8.9416 21.0308 9.7424 20.6594 10.4914L22.3964 11.9456C23.0454 10.8145 23.4612 9.53222 23.4612 8.06101C23.4612 5.87314 22.7522 4.13532 21.5821 2.94644C20.4193 1.76506 18.8709 1.19897 17.3352 1.23124Z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={previous}
            className="opacity-60 transition hover:opacity-100 active:scale-95"
          >
            <img src="/prev.svg" alt="Previous" className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="transition hover:scale-105 active:scale-95"
            aria-label={isPlaying ? "Пауза" : "Играть"}
            title={isPlaying ? "Пауза" : "Играть"}
          >
            {isPlaying || isLoading ? (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#8341EF] text-white shadow-[0_0_24px_rgba(131,65,239,0.42)]">
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </span>
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#8341EF] text-white shadow-[0_0_24px_rgba(131,65,239,0.42)]">
                <svg className="ml-0.5 h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={next}
            className="opacity-60 transition hover:opacity-100 active:scale-95"
          >
            <img src="/next.svg" alt="Next" className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => toggleLike()}
            className="transition hover:opacity-100 active:scale-95 text-white"
          >
            {isLiked ? (
              <svg 
                className="h-5 w-5 fill-[#8341EF]" 
                viewBox="0 0 23 21"
              >
                <path fillRule="evenodd" clipRule="evenodd" d="M11.0958 20.3559H9.98625C9.98625 19.6871 9.61354 18.9719 8.74277 18.0828C8.05069 17.3761 7.17904 16.6893 6.20111 15.9187C5.94443 15.7164 5.68019 15.5083 5.4102 15.2926C2.95968 13.3351 0 10.7561 0 6.83102C0 4.64321 0.709002 2.9054 1.87914 1.71651C3.04188 0.535137 4.59035 -0.03095 6.12602 0.00131666C8.07884 0.042349 9.95662 1.03604 11.0958 2.85433C12.235 1.03603 14.1128 0.0423379 16.0657 0.00130555C17.6013 -0.0309722 19.1497 0.535115 20.3126 1.7165C21.4826 2.90538 22.1917 4.6432 22.1917 6.83102C22.1917 10.7561 19.232 13.3351 16.7815 15.2926C16.5114 15.5084 16.2473 15.7164 15.9905 15.9187C15.0127 16.6893 14.141 17.3761 13.4489 18.0828C12.5781 18.9719 12.2054 19.6871 12.2054 20.3559H11.0958Z" />
              </svg>
            ) : (
              <svg 
                className="h-5 w-5 fill-white/70 opacity-60 hover:opacity-100" 
                viewBox="0 0 27 27"
              >
                <path fillRule="evenodd" clipRule="evenodd" d="M18.3315 5.37526C16.4748 5.41427 14.4247 6.87936 14.4247 10.1962H12.2055C12.2055 6.87937 10.1553 5.41428 8.29863 5.37527C7.33775 5.35508 6.38965 5.70742 5.67997 6.42846C4.97768 7.142 4.4384 8.2906 4.4384 9.98631C4.4384 12.7187 6.47185 14.683 9.01446 16.714C9.24981 16.9019 9.49053 17.0915 9.73297 17.2823C10.7244 18.0627 11.745 18.866 12.5475 19.6853C12.8173 19.9608 13.0782 20.2532 13.3151 20.5636C13.552 20.2532 13.8128 19.9608 14.0827 19.6853C14.8851 18.866 15.9057 18.0627 16.8971 17.2823C17.1396 17.0915 17.3804 16.9019 17.6157 16.714C20.1583 14.683 22.1917 12.7187 22.1917 9.98631C22.1917 8.29059 21.6525 7.14199 20.9501 6.42845C20.2405 5.7074 19.2924 5.35506 18.3315 5.37526V5.37526M14.4247 23.5112H12.2055C12.2055 22.8423 11.8328 22.1272 10.962 21.2381C10.2699 20.5315 9.39828 19.8446 8.42033 19.0739C8.16359 18.8717 7.89951 18.6636 7.62943 18.4478C5.17892 16.4904 2.21924 13.9114 2.21924 9.98631C2.21924 7.7985 2.92824 6.06068 4.09837 4.87179C5.26112 3.69042 6.80958 3.12432 8.34526 3.15659C10.2981 3.19762 12.1759 4.19131 13.3151 6.00961C14.4543 4.19131 16.332 3.19762 18.2849 3.15658C19.8206 3.12431 21.369 3.6904 22.5318 4.87178C23.7019 6.06067 24.4109 7.79849 24.4109 9.98631C24.4109 13.9114 21.4512 16.4904 19.0007 18.4478C18.7306 18.6636 18.4665 18.8717 18.2098 19.0739C17.2319 19.8446 16.3602 20.5315 15.6682 21.2381C14.7974 22.1272 14.4247 22.8423 14.4247 23.5112V23.5112" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
