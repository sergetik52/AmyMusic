import WaveSeedModal from "./WaveSeedModal";
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getPersonalWaveTracks, getWaveTracks, searchTracks, searchArtists } from "../services/soundCloudApi";


function formatTime(val) {
  if (!val) return "";
  // If value is > 5000, it's likely ms. Otherwise, it's seconds.
  const seconds = val > 5000 ? Math.floor(val / 1000) : Math.floor(val);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* helper: cover mosaic - horizontal row */
function CoverMosaic({ covers = [] }) {
  const validCovers = covers.filter(Boolean).slice(0, 8);
  if (validCovers.length === 0) {
    return <div className="bg-white/[0.04] h-full w-full" />;
  }
  return (
    <div className="flex h-full w-full overflow-hidden">
      {validCovers.map((cover, i) => (
        <img key={i} src={cover} alt="" className="h-full flex-1 min-w-0 object-cover" />
      ))}
    </div>
  );
}

/* helper: shuffle */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* helper: load/save wave seeds from localStorage */
function loadWaveSeeds() {
  try {
    const raw = localStorage.getItem("amy_wave_seeds");
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function saveWaveSeeds(seeds) {
  localStorage.setItem("amy_wave_seeds", JSON.stringify(seeds));
}

/* ═══ MAIN COMPONENT ═══ */
export default function HomeView({ onStartWave, onOpenCollection, onOpenArtist }) {
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
  const [showSeedPicker, setShowSeedPicker] = useState(false);
  const [waveSeeds, setWaveSeeds] = useState(() => loadWaveSeeds());
  const forYouRef = useRef(null);
  const hasLoadedRef = useRef(false);

  const heroCover = useMemo(() => {
    if (currentTrack && currentTrack.id !== "empty" && currentTrack.cover) return currentTrack.cover;
    if (playHistory.length > 0 && playHistory[0].cover) return playHistory[0].cover;
    return null;
  }, [currentTrack, playHistory]);

  const historyCovers = useMemo(() => playHistory.filter(t => t.cover).slice(0, 8).map(t => t.cover), [playHistory]);
  const favCovers = useMemo(() => likedTracks.filter(t => t.cover).slice(0, 8).map(t => t.cover), [likedTracks]);

  // Build search queries from wave seeds
  const buildSeedQueries = useCallback(() => {
    const queries = [];
    waveSeeds.forEach(seed => {
      if (seed.type === "artist") {
        queries.push(seed.name);
      } else if (seed.type === "track") {
        queries.push(`${seed.artist} ${seed.name}`);
        if (seed.artist) queries.push(seed.artist);
      }
    });
    return queries;
  }, [waveSeeds]);

  // Load "For You" tracks based on seeds
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    let cancelled = false;

    async function loadForYou() {
      setIsLoadingForYou(true);
      try {
        let tracks = [];
        const seedQueries = buildSeedQueries();

        if (seedQueries.length > 0) {
          // Use seed-based queries for personalized results
          const results = await Promise.allSettled(
            seedQueries.slice(0, 6).map(q => searchTracks(q))
          );
          const seen = new Set();
          results.forEach(r => {
            if (r.status === "fulfilled") {
              r.value.forEach(t => {
                if (!seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
              });
            }
          });
        }

        if (!tracks.length) {
          tracks = await getPersonalWaveTracks({
            likedTracks, dislikedTrackIds, dislikedTracks, playHistory, currentTrack,
          });
        }

        if (!tracks.length) {
          tracks = await getWaveTracks("phonk underground");
        }

        if (!cancelled) setForYouTracks(shuffleArray(tracks).slice(0, 20));
      } catch (err) {
        console.error("[HomeView] Failed to load forYou:", err);
      } finally {
        if (!cancelled) setIsLoadingForYou(false);
      }
    }

    loadForYou();
    return () => { cancelled = true; };
  }, []);

  // Reload "For You" when seeds change
  const reloadForYou = useCallback(async () => {
    setIsLoadingForYou(true);
    try {
      let tracks = [];
      const seedQueries = buildSeedQueries();

      if (seedQueries.length > 0) {
        const results = await Promise.allSettled(
          seedQueries.slice(0, 6).map(q => searchTracks(q))
        );
        const seen = new Set();
        results.forEach(r => {
          if (r.status === "fulfilled") {
            r.value.forEach(t => {
              if (!seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
            });
          }
        });
      }

      if (!tracks.length) {
        tracks = await getPersonalWaveTracks({
          likedTracks, dislikedTrackIds, dislikedTracks, playHistory, currentTrack,
        });
      }

      setForYouTracks(shuffleArray(tracks).slice(0, 20));
    } catch (err) {
      console.error("[HomeView] Reload failed:", err);
    } finally {
      setIsLoadingForYou(false);
    }
  }, [buildSeedQueries, likedTracks, dislikedTrackIds, dislikedTracks, playHistory, currentTrack]);

  // Start wave with seeds
  const handleStartWave = async () => {
    if (isWaveLoading) return;
    setIsWaveLoading(true);
    try {
      let tracks = [];
      const seedQueries = buildSeedQueries();

      if (seedQueries.length > 0) {
        // Fetch tracks based on user's selected seeds
        const results = await Promise.allSettled(
          seedQueries.slice(0, 8).map(q => searchTracks(q))
        );
        const seen = new Set();
        results.forEach(r => {
          if (r.status === "fulfilled") {
            r.value.forEach(t => {
              if (!seen.has(t.id)) { seen.add(t.id); tracks.push(t); }
            });
          }
        });
      }

      if (!tracks.length) {
        tracks = await getPersonalWaveTracks({
          likedTracks, dislikedTrackIds, dislikedTracks, playHistory, currentTrack,
        });
      }

      if (!tracks.length) {
        tracks = await getWaveTracks("phonk underground");
      }

      const shuffled = shuffleArray(tracks);
      if (shuffled.length > 0) {
        playTrack(shuffled[0], shuffled);
      }
      if (onStartWave) onStartWave();
    } catch (err) {
      console.error("[HomeView] Wave error:", err);
    } finally {
      setIsWaveLoading(false);
    }
  };


  return (
    <section className="home-view flex-1 h-full overflow-y-auto custom-scrollbar bg-[#000]">
      {/* HERO BANNER */}
      <div className="home-hero relative w-full overflow-hidden" style={{ height: "clamp(280px, 45vh, 420px)" }}>
        {heroCover && (
          <div className="absolute inset-0 z-0">
            <img src={heroCover} alt="" className="absolute inset-0 h-full w-full object-cover blur-[60px] opacity-40 animate-cover-float" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />
          </div>
        )}
        {!heroCover && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0030] via-[#0a0015] to-black" />
        )}

        {/* Decorative Wavy Line behind Play Button */}
        <div className="absolute inset-y-0 right-0 z-0 pointer-events-none flex items-center justify-end overflow-hidden w-[60%] max-w-[600px]">
          <svg className="w-[120%] h-[120%] opacity-30 mix-blend-overlay translate-x-[10%]" viewBox="0 0 500 500" preserveAspectRatio="xMaxYMid meet" fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
            {/* Using Q/T (Quadratic Bezier) for perfectly smooth flowing waves rather than sharp zig-zags */}
            <path d="M 600 40 Q 150 70 120 160 T 450 260 T 80 380 Q 150 480 300 550" />
          </svg>
        </div>


        <div className="relative z-10 flex h-full items-center px-6 md:px-10">
          <div className="h-[140px] w-[140px] md:h-[200px] md:w-[200px] shrink-0 overflow-hidden rounded-[18px] shadow-2xl border border-white/10">
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

          <div className="ml-5 md:ml-8 flex flex-col justify-between h-[140px] md:h-[200px] py-1 md:py-2">
            <h1 className="text-[48px] md:text-[76px] font-black text-white tracking-tighter leading-[0.85]">
              Моя<br/>волна
            </h1>
            
            <div className="mt-auto flex flex-col gap-2">
              {waveSeeds.length > 0 && (
                <p className="text-[13px] font-semibold text-white/40 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  {waveSeeds.length} источников
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowSeedPicker(!showSeedPicker)}
                className="text-left text-[14px] md:text-[16px] font-bold text-white hover:text-white/70 transition flex items-center gap-2 w-fit uppercase tracking-widest"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                Настроить
              </button>
            </div>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleStartWave}
            disabled={isWaveLoading}
            className="h-14 w-14 md:h-16 md:w-16 shrink-0 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50"
          >
            {isWaveLoading ? (
              <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-7 h-7 ml-0.5 text-black" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="p-4 md:p-6 space-y-5 pb-28">

        {/* Wave Seed Modal */}
        {showSeedPicker && (
          <WaveSeedModal
            seeds={waveSeeds}
            setSeeds={(s) => { setWaveSeeds(s); saveWaveSeeds(s); hasLoadedRef.current = false; }}
            onClose={() => { setShowSeedPicker(false); reloadForYou(); }}
          />
        )}

        {/* Wave seed chips (compact, always visible if seeds exist) */}
        {!showSeedPicker && waveSeeds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-white/25 uppercase tracking-wider mr-1">Волна по:</span>
            {waveSeeds.slice(0, 6).map((seed, i) => (
              <div key={`chip-${seed.type}-${seed.id}-${i}`} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full pl-1 pr-2.5 py-0.5">
                <img src={seed.cover || "/user.svg"} alt="" className={`h-5 w-5 shrink-0 object-cover ${seed.type === "artist" ? "rounded-full" : "rounded"}`} />
                <span className="text-[11px] font-semibold text-white/60 truncate max-w-[80px]">{seed.name}</span>
              </div>
            ))}
            {waveSeeds.length > 6 && <span className="text-[11px] text-white/30">+{waveSeeds.length - 6}</span>}
          </div>
        )}

        {/* GRID: History + Favorites */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button type="button" onClick={() => { if(showHistoryPanel) setShowHistoryPanel(false); else setShowHistoryPanel(true); }}
            className="home-card group relative h-[80px] rounded-[18px] overflow-hidden bg-black shadow-[inset_0_0_0_1px_rgba(0,0,0,1)] ring-1 ring-inset ring-black/20 transform-gpu transition-all duration-300 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,1),0_0_15px_rgba(255,255,255,0.05)] text-left">
            <div className="absolute inset-0 scale-[1.03] origin-center"><CoverMosaic covers={historyCovers} /><div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-black/20" /></div>
            <div className="relative z-10 flex h-full items-center px-5 gap-3.5">
              <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/10">
                <svg className="h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight">{"История"}</p>
                <p className="text-[12px] text-white/50 leading-tight mt-0.5">{playHistory.length > 0 ? `${playHistory.length} прослушанных треков` : "Ваши недавно прослушанные треки"}</p>
              </div>
            </div>
          </button>
          <button type="button" onClick={() => onOpenCollection?.()}
            className="home-card group relative h-[80px] rounded-[18px] overflow-hidden bg-black shadow-[inset_0_0_0_1px_rgba(0,0,0,1)] ring-1 ring-inset ring-black/20 transform-gpu transition-all duration-300 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,1),0_0_15px_rgba(255,255,255,0.05)] text-left">
            <div className="absolute inset-0 scale-[1.03] origin-center"><CoverMosaic covers={favCovers} /><div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-black/20" /></div>
            <div className="relative z-10 flex h-full items-center px-5 gap-3.5">
              <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/10">
                <svg className="h-4 w-4 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight">{"Любимые треки"}</p>
                <p className="text-[12px] text-white/50 leading-tight mt-0.5">{likedTracks.length > 0 ? `${likedTracks.length} треков` : "Ваша коллекция любимой музыки"}</p>
              </div>
            </div>
          </button>
        </div>

        {/* History Panel (Full Screen Slide-out) */}
        <div 
          className={`fixed inset-0 z-[100] flex transition-all duration-300 ${showHistoryPanel ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {/* Backdrop */}
          <div 
            className={`absolute inset-0 bg-black/40 transition-all duration-300 ease-out ${showHistoryPanel ? 'backdrop-blur-md opacity-100' : 'backdrop-blur-none opacity-0'}`}
            onClick={() => setShowHistoryPanel(false)}
          />
          
          {/* Side Panel */}
          <div 
            className={`relative w-[85%] md:w-[400px] h-full bg-[#0a0a0a] shadow-2xl flex flex-col border-r border-white/5 transition-transform duration-300 ease-out ${showHistoryPanel ? 'translate-x-0' : '-translate-x-full'}`}
          >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
                <div>
                  <h3 className="text-[20px] font-bold text-white tracking-tight">История</h3>
                  <p className="text-[12px] text-white/40 mt-0.5">{playHistory.length} прослушанных треков</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowHistoryPanel(false)} 
                  className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-full transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              
              {/* Track List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {playHistory.map((track, i) => (
                  <div 
                    key={`${track.id}-${i}`} 
                    className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition text-left group"
                  >
                    {/* Cover (clickable to play) */}
                    <button 
                      type="button" 
                      onClick={() => { playTrack(track, playHistory); setShowHistoryPanel(false); }}
                      className="relative h-[52px] w-[52px] shrink-0 block hover:scale-105 transition-transform"
                    >
                      <img src={track.cover} alt="" className="h-full w-full rounded-xl object-cover shadow-sm" />
                    </button>
                    
                    {/* Text */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <button 
                        type="button"
                        onClick={() => { playTrack(track, playHistory); setShowHistoryPanel(false); }}
                        className="text-[14.5px] font-bold text-white truncate text-left hover:underline"
                      >
                        {track.title}
                      </button>
                      <button 
                        type="button"
                        onClick={() => { 
                          if (onOpenArtist) onOpenArtist({ name: track.artist, id: track.userId || track.artist });
                          setShowHistoryPanel(false);
                        }}
                        className="text-[12px] font-medium text-white/40 truncate text-left mt-0.5 hover:text-white/80 hover:underline w-fit"
                      >
                        {track.artist || "soundcloud"}
                      </button>
                    </div>
                    
                    {/* Duration */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] font-semibold text-white/30 group-hover:text-white/50 transition">
                        {formatTime(track.full_duration || track.duration || 0)}
                      </span>
                    </div>
                  </div>
                ))}
                
                {playHistory.length === 0 && (
                  <div className="flex items-center justify-center h-40">
                    <p className="text-white/30 text-[13px]">История пуста</p>
                  </div>
                )}
              </div>
            </div>
          </div>

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
            <div ref={forYouRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x"
              onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollBy({ left: e.deltaY > 0 ? 300 : -300, behavior: "smooth" }); }}>
              {forYouTracks.map((track, i) => (
                <button key={`${track.id}-${i}`} type="button" onClick={() => playTrack(track, forYouTracks)}
                  className="group w-[140px] shrink-0 text-left snap-start transition-transform duration-300 hover:scale-[1.02]">
                  <div className="relative aspect-square overflow-hidden rounded-[16px] bg-white/[0.04] shadow-md group-hover:shadow-xl transition-shadow duration-300">
                    <img src={track.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/30 pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="black" className="ml-1"><path d="M8 5v14l11-7z" /></svg>
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
              <p className="text-white/30 text-[14px] font-medium">{"Послушайте что-нибудь, и мы подберём треки для вас"}</p>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
