import React, { useEffect, useState, useRef, useMemo } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getPersonalWaveTracks, getWaveTracks } from "../services/soundCloudApi";

/* helper: cover mosaic (up to 4 covers in a grid) */
function CoverMosaic({ covers = [], className = "" }) {
  const validCovers = covers.filter(Boolean).slice(0, 4);
  if (validCovers.length === 0) {
    return <div className={`bg-white/[0.04] ${className}`} />;
  }
  if (validCovers.length === 1) {
    return (
      <img
        src={validCovers[0]}
        alt=""
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`grid ${validCovers.length <= 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"} h-full w-full ${className}`}>
      {validCovers.map((cover, i) => (
        <img key={i} src={cover} alt="" className="h-full w-full object-cover" />
      ))}
    </div>
  );
}

/* helper: shuffle array */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* main component */
export default function HomeView({ onStartWave, onOpenCollection }) {
  const {
    currentTrack,
    playHistory,
    likedTracks,
    playTrack,
    isPlaying,
    dislikedTrackIds,
    dislikedTracks,
  } = useAudioPlayer();

  const [forYouTracks, setForYouTracks] = useState([]);
  const [isLoadingForYou, setIsLoadingForYou] = useState(true);
  const [isWaveLoading, setIsWaveLoading] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const forYouRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // Determine hero cover from recent history or current track
  const heroCover = useMemo(() => {
    if (currentTrack && currentTrack.id !== "empty" && currentTrack.cover) {
      return currentTrack.cover;
    }
    if (playHistory.length > 0 && playHistory[0].cover) {
      return playHistory[0].cover;
    }
    return null;
  }, [currentTrack, playHistory]);

  // Build recent covers for the History card mosaic
  const historyCovers = useMemo(() => {
    return playHistory
      .filter((t) => t.cover)
      .slice(0, 8)
      .map((t) => t.cover);
  }, [playHistory]);

  // Build covers for the Favorites card mosaic
  const favCovers = useMemo(() => {
    return likedTracks
      .filter((t) => t.cover)
      .slice(0, 8)
      .map((t) => t.cover);
  }, [likedTracks]);

  // Load "For You" tracks
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let cancelled = false;

    async function loadForYou() {
      setIsLoadingForYou(true);
      try {
        let tracks = await getPersonalWaveTracks({
          likedTracks,
          dislikedTrackIds,
          dislikedTracks,
          playHistory,
          currentTrack,
        });

        if (!tracks.length) {
          tracks = await getWaveTracks("phonk underground");
        }

        if (!cancelled) {
          setForYouTracks(shuffleArray(tracks).slice(0, 20));
        }
      } catch (err) {
        console.error("[HomeView] Failed to load forYou:", err);
      } finally {
        if (!cancelled) setIsLoadingForYou(false);
      }
    }

    loadForYou();
    return () => { cancelled = true; };
  }, []);

  // Start wave handler
  const handleStartWave = async () => {
    if (isWaveLoading) return;
    setIsWaveLoading(true);
    try {
      let tracks = await getPersonalWaveTracks({
        likedTracks,
        dislikedTrackIds,
        dislikedTracks,
        playHistory,
        currentTrack,
      });
      if (!tracks.length) {
        tracks = await getWaveTracks("phonk underground");
      }
      const shuffled = shuffleArray(tracks);
      if (shuffled.length > 0) {
        playTrack(shuffled[0], shuffled);
      }
      if (onStartWave) onStartWave();
    } catch (err) {
      console.error("[HomeView] Wave start error:", err);
    } finally {
      setIsWaveLoading(false);
    }
  };

  // Memoize shuffled liked tracks to avoid re-shuffle on each render
  const shuffledLiked = useMemo(() => {
    return shuffleArray(likedTracks).slice(0, 15);
  }, [likedTracks]);

  return (
    <section className="home-view absolute inset-0 overflow-y-auto custom-scrollbar bg-[#000]">
      {/* HERO BANNER */}
      <div className="home-hero relative w-full overflow-hidden" style={{ height: "clamp(160px, 28vh, 240px)" }}>
        {/* Blur background */}
        {heroCover && (
          <div className="absolute inset-0 z-0">
            <img
              src={heroCover}
              alt=""
              className="absolute inset-0 h-full w-full object-cover scale-150 blur-[60px] opacity-40 animate-cover-breathe"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />
          </div>
        )}
        {!heroCover && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0030] via-[#0a0015] to-black" />
        )}

        {/* Hero content */}
        <div className="relative z-10 flex h-full items-center px-6 md:px-10">
          {/* Cover art */}
          <div className="h-[100px] w-[100px] md:h-[130px] md:w-[130px] shrink-0 overflow-hidden rounded-[18px] shadow-2xl border border-white/10">
            {heroCover ? (
              <img src={heroCover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-white/[0.06] flex items-center justify-center">
                <svg className="w-10 h-10 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="ml-5 md:ml-8 flex flex-col gap-1">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
              {"Моя волна"}
            </h1>
            <p className="text-[13px] md:text-[14px] font-medium text-white/50 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              {"Обычная"}
            </p>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Play button */}
          <button
            type="button"
            onClick={handleStartWave}
            disabled={isWaveLoading}
            className="h-14 w-14 md:h-16 md:w-16 shrink-0 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50"
          >
            {isWaveLoading ? (
              <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-7 h-7 ml-0.5 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="p-4 md:p-6 space-y-6 pb-32">

        {/* GRID: History + Favorites */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* History Card */}
          <button
            type="button"
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            className="home-card group relative h-[80px] rounded-[18px] overflow-hidden bg-black border border-white/[0.06] transition-all duration-300 hover:border-white/10 hover:shadow-lg text-left"
          >
            <div className="absolute inset-0">
              <CoverMosaic covers={historyCovers.slice(0, 4)} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/30" />
            </div>
            <div className="relative z-10 flex h-full items-center px-5 gap-3.5">
              <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/10">
                <svg className="h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight">{"История"}</p>
                <p className="text-[12px] text-white/50 leading-tight mt-0.5">
                  {playHistory.length > 0
                    ? `${playHistory.length} прослушанных треков`
                    : "Ваши недавно прослушанные треки"}
                </p>
              </div>
            </div>
          </button>

          {/* Favorites Card */}
          <button
            type="button"
            onClick={() => onOpenCollection?.()}
            className="home-card group relative h-[80px] rounded-[18px] overflow-hidden bg-black border border-white/[0.06] transition-all duration-300 hover:border-white/10 hover:shadow-lg text-left"
          >
            <div className="absolute inset-0">
              <CoverMosaic covers={favCovers.slice(0, 4)} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/30" />
            </div>
            <div className="relative z-10 flex h-full items-center px-5 gap-3.5">
              <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/10">
                <svg className="h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight">{"Любимые треки"}</p>
                <p className="text-[12px] text-white/50 leading-tight mt-0.5">
                  {likedTracks.length > 0
                    ? `${likedTracks.length} треков`
                    : "Ваша коллекция любимой музыки"}
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* History Panel (expandable) */}
        {showHistoryPanel && playHistory.length > 0 && (
          <div className="rounded-[18px] border border-white/[0.06] bg-[#0a0a0a] overflow-hidden animate-slide-up-fade">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
              <span className="text-[14px] font-bold text-white">{"Недавно прослушанные"}</span>
              <button
                type="button"
                onClick={() => setShowHistoryPanel(false)}
                className="text-white/30 hover:text-white/70 transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2">
              {playHistory.slice(0, 30).map((track, i) => (
                <button
                  key={`${track.id}-${i}`}
                  type="button"
                  onClick={() => playTrack(track, playHistory)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition text-left group"
                >
                  <img
                    src={track.cover}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate group-hover:text-white/90">{track.title}</p>
                    <p className="text-[11px] text-white/40 truncate">{track.artist}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition">
                    <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FOR YOU CAROUSEL */}
        <div>
          <h2 className="text-[17px] md:text-[19px] font-bold text-white mb-4 px-1">{"Для вас"}</h2>
          {isLoadingForYou ? (
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-[140px] shrink-0">
                  <div className="aspect-square rounded-[16px] bg-white/[0.04] animate-pulse" />
                  <div className="mt-3 h-3 w-20 bg-white/[0.04] rounded animate-pulse" />
                  <div className="mt-1.5 h-2.5 w-14 bg-white/[0.03] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : forYouTracks.length > 0 ? (
            <div
              ref={forYouRef}
              className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollBy({
                    left: e.deltaY > 0 ? 300 : -300,
                    behavior: "smooth",
                  });
                }
              }}
            >
              {forYouTracks.map((track, i) => (
                <button
                  key={`${track.id}-${i}`}
                  type="button"
                  onClick={() => playTrack(track, forYouTracks)}
                  className="group w-[140px] shrink-0 text-left snap-start transition-transform duration-300 hover:scale-[1.02]"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[16px] bg-white/[0.04] shadow-md group-hover:shadow-xl transition-shadow duration-300">
                    <img
                      src={track.cover}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/30 pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="black" className="ml-1">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-[14px] font-bold text-white">{track.title}</p>
                  <p className="truncate text-[12px] font-medium text-white/45">{track.artist}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 rounded-[18px] border border-dashed border-white/[0.06] bg-white/[0.01]">
              <p className="text-white/30 text-[14px] font-medium">
                {"Послушайте что-нибудь, и мы подберём треки для вас"}
              </p>
            </div>
          )}
        </div>

        {/* FROM LIKED (if user has liked tracks) */}
        {likedTracks.length > 4 && (
          <div>
            <h2 className="text-[17px] md:text-[19px] font-bold text-white mb-4 px-1">{"Из вашей коллекции"}</h2>
            <div
              className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollBy({
                    left: e.deltaY > 0 ? 300 : -300,
                    behavior: "smooth",
                  });
                }
              }}
            >
              {shuffledLiked.map((track, i) => (
                <button
                  key={`liked-${track.id}-${i}`}
                  type="button"
                  onClick={() => playTrack(track, likedTracks)}
                  className="group w-[140px] shrink-0 text-left snap-start transition-transform duration-300 hover:scale-[1.02]"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[16px] bg-white/[0.04] shadow-md group-hover:shadow-xl transition-shadow duration-300">
                    <img
                      src={track.cover}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/30 pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="black" className="ml-1">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-[14px] font-bold text-white">{track.title}</p>
                  <p className="truncate text-[12px] font-medium text-white/45">{track.artist}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
