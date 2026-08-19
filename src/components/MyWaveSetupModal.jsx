import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  Search,
  Check,
  ChevronRight,
  Sparkles,
  Heart,
  X,
  Play,
  Pause,
  RotateCcw,
  Radio,
  Music2,
  Sliders,
  Volume2,
  VolumeX,
  Zap,
  ArrowRight
} from "lucide-react";

// --- MOCK DATA ---
const MOCK_ARTISTS = [
  { id: "art-1", name: "KIZARU", genre: "Hip-Hop / Trap", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=400&q=80" },
  { id: "art-2", name: "OG Buda", genre: "Trap / New Wave", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80" },
  { id: "art-3", name: "PHARAOH", genre: "Cloud Rap", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80" },
  { id: "art-4", name: "Saluki", genre: "Alternative Hip-Hop", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80" },
  { id: "art-5", name: "Big Baby Tape", genre: "Trap", avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80" },
  { id: "art-6", name: "Miyagi & Эндшпиль", genre: "Reggae Rap", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80" },
  { id: "art-7", name: "Скриптонит", genre: "Hip-Hop / Experimental", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80" },
  { id: "art-8", name: "Markul", genre: "Pop Rap", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80" },
  { id: "art-9", name: "Obladaet", genre: "UK Drill", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" },
  { id: "art-10", name: "LSP (ЛСП)", genre: "Indie Pop Rap", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
  { id: "art-11", name: "Teezo Touchdown", genre: "Alt Rock / Rap", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80" },
  { id: "art-12", name: "Travis Scott", genre: "Psychedelic Trap", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80" }
];

const MOCK_TRACKS = [
  { id: "tr-1", title: "Дежавю", artist: "KIZARU", cover: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-2", title: "BLACK AIR FORCE", artist: "OG Buda", cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-3", title: "Одинокая звезда", artist: "PHARAOH", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-4", title: "WILD EA$T", artist: "Saluki", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-5", title: "Gimme The Loot", artist: "Big Baby Tape", cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-6", title: "I Got Love", artist: "Miyagi & Эндшпиль", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-7", title: "Цепь", artist: "Скриптонит", cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=600&q=80", audio: "" },
  { id: "tr-8", title: "Яхты, Паруса", artist: "Markul", cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=600&q=80", audio: "" }
];

// --- TINDER SWIPE CARD COMPONENT ---
function SwipeCard({ track, onSwipe, isTop, isPlaying, onTogglePlay }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.6, 1, 1, 1, 0.6]);

  // Dynamic Neon Badges Opacity & Scale
  const likeOpacity = useTransform(x, [15, 120], [0, 1]);
  const likeScale = useTransform(x, [15, 120], [0.8, 1.1]);
  
  const skipOpacity = useTransform(x, [-15, -120], [0, 1]);
  const skipScale = useTransform(x, [-15, -120], [0.8, 1.1]);

  const handleDragEnd = (_, info) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      onSwipe("right");
    } else if (info.offset.x < -threshold) {
      onSwipe("left");
    }
  };

  return (
    <motion.div
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        opacity: isTop ? opacity : 0.85
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      whileGrab={{ cursor: "grabbing" }}
      className={`absolute inset-0 rounded-3xl overflow-hidden border border-white/10 bg-[#121216] shadow-2xl select-none transition-transform duration-300 ${
        !isTop ? "pointer-events-none scale-95 translate-y-3" : "cursor-grab"
      }`}
    >
      {/* Cover Image & Background Gradient */}
      <div className="relative h-full w-full">
        <img
          src={track.cover}
          alt={track.title}
          className="h-full w-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/50 to-transparent" />

        {/* SWIPE OVERLAY BADGES */}
        {isTop && (
          <>
            {/* LIKE BADGE (SWIPE RIGHT) */}
            <motion.div
              style={{ opacity: likeOpacity, scale: likeScale }}
              className="absolute top-8 left-8 z-30 flex items-center gap-2 rounded-2xl border-2 border-emerald-400 bg-emerald-950/80 px-5 py-2.5 backdrop-blur-md shadow-[0_0_30px_rgba(52,211,153,0.5)]"
            >
              <Heart className="h-6 w-6 fill-emerald-400 text-emerald-400" />
              <span className="text-base font-black uppercase tracking-wider text-emerald-300">
                НРАВИТСЯ
              </span>
            </motion.div>

            {/* SKIP BADGE (SWIPE LEFT) */}
            <motion.div
              style={{ opacity: skipOpacity, scale: skipScale }}
              className="absolute top-8 right-8 z-30 flex items-center gap-2 rounded-2xl border-2 border-rose-500 bg-rose-950/80 px-5 py-2.5 backdrop-blur-md shadow-[0_0_30px_rgba(244,63,94,0.5)]"
            >
              <X className="h-6 w-6 text-rose-400 stroke-[3]" />
              <span className="text-base font-black uppercase tracking-wider text-rose-300">
                МИМО
              </span>
            </motion.div>
          </>
        )}

        {/* TRACK DETAILS & PLAY BUTTON OVERLAY */}
        <div className="absolute bottom-0 inset-x-0 p-8 flex items-end justify-between z-20">
          <div className="space-y-1 max-w-[70%]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFCC00]/10 border border-[#FFCC00]/20 text-[11px] font-bold text-[#FFCC00] uppercase tracking-widest">
              <Zap className="h-3 w-3 fill-current" /> Превью
            </span>
            <h3 className="text-2xl font-black text-white tracking-tight leading-tight truncate">
              {track.title}
            </h3>
            <p className="text-sm font-semibold text-white/60 truncate">
              {track.artist}
            </p>
          </div>

          {/* PLAY/PAUSE MINI BUTTON */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlay(track.id);
            }}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FFCC00] text-black font-bold shadow-[0_0_25px_rgba(255,204,0,0.4)] transition hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="h-6 w-6 fill-current ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// --- MAIN MY WAVE SETUP MODAL COMPONENT ---
export function MyWaveSetupModal({ isOpen = true, onClose, onComplete }) {
  const [step, setStep] = useState(1); // 1: Artists, 2: Tinder Swiper, 3: Finish
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtists, setSelectedArtists] = useState([]);
  
  // Step 2 Swiper state
  const [trackPool, setTrackPool] = useState(MOCK_TRACKS);
  const [likedTracks, setLikedTracks] = useState([]);
  const [skippedTracks, setSkippedTracks] = useState([]);
  const [playingTrackId, setPlayingTrackId] = useState(null);

  if (!isOpen) return null;

  // STEP 1 HANDLERS
  const filteredArtists = MOCK_ARTISTS.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.genre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleArtistSelection = (artist) => {
    if (selectedArtists.some(a => a.id === artist.id)) {
      setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
    } else {
      if (selectedArtists.length < 5) {
        setSelectedArtists(prev => [...prev, artist]);
      }
    }
  };

  // STEP 2 SWIPE HANDLERS
  const handleSwipe = (direction) => {
    if (trackPool.length === 0) return;
    const current = trackPool[0];

    if (direction === "right") {
      setLikedTracks(prev => [...prev, current]);
    } else {
      setSkippedTracks(prev => [...prev, current]);
    }

    setTrackPool(prev => prev.slice(1));

    // If last track swiped -> transition to step 3
    if (trackPool.length <= 1) {
      setTimeout(() => setStep(3), 350);
    }
  };

  const handleFinish = () => {
    onComplete?.({
      selectedArtists,
      likedTracks,
      skippedTracks
    });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      {/* MODAL CARD CONTAINER */}
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0C]/95 text-white shadow-[0_20px_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        
        {/* HEADER BAR */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFCC00]/10 border border-[#FFCC00]/20 text-[#FFCC00]">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Калибровка «Моей волны»
              </h2>
              <p className="text-xs font-semibold text-white/40">
                Персонализация умных рекомендаций AmyMusic
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* STEP CONTENT BODY */}
        <div className="p-8">

          {/* ================= STEP 1: ONBOARDING (5 ARTISTS) ================= */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* TITLE & SEARCH BAR */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-white">
                    Выберите 5 любимых исполнителей
                  </h3>
                  <p className="text-xs font-semibold text-white/50 mt-0.5">
                    Это заложит фундаментальный тотем вашего индивидуального звучания.
                  </p>
                </div>

                {/* SEARCH INPUT */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск артиста..."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-4 py-2 text-xs font-semibold text-white placeholder-white/30 focus:border-[#FFCC00]/50 focus:bg-white/[0.08] focus:outline-none transition"
                  />
                </div>
              </div>

              {/* ARTISTS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-none">
                {filteredArtists.map((artist) => {
                  const isSelected = selectedArtists.some(a => a.id === artist.id);
                  return (
                    <motion.div
                      key={artist.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleArtistSelection(artist)}
                      className={`relative flex flex-col items-center p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                        isSelected
                          ? "border-[#FFCC00] bg-[#FFCC00]/10 shadow-[0_0_20px_rgba(255,204,0,0.15)]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      {/* CHECKMARK BADGE */}
                      <div className={`absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
                        isSelected ? "bg-[#FFCC00] text-black scale-100" : "border border-white/20 bg-black/40 scale-90 opacity-0"
                      }`}>
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </div>

                      {/* AVATAR */}
                      <img
                        src={artist.avatar}
                        alt={artist.name}
                        className="h-20 w-20 rounded-full object-cover shadow-lg mb-3 border border-white/10"
                      />

                      {/* TEXT */}
                      <span className="text-xs font-extrabold text-white text-center truncate w-full">
                        {artist.name}
                      </span>
                      <span className="text-[10px] font-semibold text-white/40 text-center truncate w-full mt-0.5">
                        {artist.genre}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* FOOTER BAR: PROGRESS & NEXT BUTTON */}
              <div className="flex items-center justify-between border-t border-white/[0.08] pt-5">
                {/* AVATARS STACK & PROGRESS */}
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`inline-block h-8 w-8 rounded-full ring-2 ring-[#0A0A0C] transition-all ${
                          selectedArtists[i]
                            ? "bg-[#FFCC00] text-black font-bold flex items-center justify-center text-xs overflow-hidden"
                            : "bg-white/10 border border-white/10"
                        }`}
                      >
                        {selectedArtists[i] ? (
                          <img src={selectedArtists[i].avatar} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <span className="text-xs font-extrabold text-white/70">
                    Выбрано <span className="text-[#FFCC00]">{selectedArtists.length}</span> / 5
                  </span>
                </div>

                {/* NEXT STEP BUTTON */}
                <button
                  type="button"
                  disabled={selectedArtists.length !== 5}
                  onClick={() => setStep(2)}
                  className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                    selectedArtists.length === 5
                      ? "bg-[#FFCC00] text-black shadow-[0_0_30px_rgba(255,204,0,0.35)] hover:scale-105 active:scale-95 cursor-pointer"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  }`}
                >
                  <span>Далее к калибровке</span>
                  <ChevronRight className="h-4 w-4 stroke-[3]" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ================= STEP 2: TINDER-STYLE SWIPER ================= */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center space-y-6"
            >
              {/* INSTRUCTION HEADER */}
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-[#FFCC00] uppercase tracking-widest">
                  Шаг 2 из 2
                </span>
                <h3 className="text-xl font-black text-white">
                  Свайпайте треки для настройки алгоритма
                </h3>
                <p className="text-xs font-semibold text-white/50">
                  Вправо — нравится • Влево — пропускаем
                </p>
              </div>

              {/* CARD STACK CONTAINER */}
              <div className="relative h-[380px] w-full max-w-sm">
                <AnimatePresence>
                  {trackPool.length > 0 ? (
                    trackPool.slice(0, 2).reverse().map((track, idx) => {
                      const isTop = idx === 1 || trackPool.length === 1;
                      return (
                        <SwipeCard
                          key={track.id}
                          track={track}
                          isTop={isTop}
                          onSwipe={handleSwipe}
                          isPlaying={playingTrackId === track.id}
                          onTogglePlay={(id) => setPlayingTrackId(prev => prev === id ? null : id)}
                        />
                      );
                    })
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#121216] text-center p-6 space-y-3">
                      <Sparkles className="h-10 w-10 text-[#FFCC00] animate-spin" />
                      <p className="text-sm font-bold text-white">Калибровка завершается...</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* ACTION BUTTONS & COUNTER */}
              <div className="flex items-center justify-center gap-6 pt-2">
                {/* DISLIKE / SKIP BUTTON */}
                <button
                  type="button"
                  onClick={() => handleSwipe("left")}
                  disabled={trackPool.length === 0}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)] transition hover:bg-rose-500 hover:text-white hover:scale-110 active:scale-95"
                >
                  <X className="h-6 w-6 stroke-[3]" />
                </button>

                {/* TRACK COUNTER */}
                <span className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-extrabold text-white/50">
                  Осталось: <span className="text-white">{trackPool.length}</span>
                </span>

                {/* LIKE BUTTON */}
                <button
                  type="button"
                  onClick={() => handleSwipe("right")}
                  disabled={trackPool.length === 0}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)] transition hover:bg-emerald-400 hover:text-black hover:scale-110 active:scale-95"
                >
                  <Heart className="h-6 w-6 fill-current" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ================= STEP 3: FINISH SCREEN ================= */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center py-8 space-y-6"
            >
              {/* NEON PULSING WAVE ICON */}
              <div className="relative flex h-24 w-24 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#FFCC00]/20 animate-ping" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#FFCC00] bg-[#FFCC00]/10 text-[#FFCC00] shadow-[0_0_50px_rgba(255,204,0,0.5)]">
                  <Sparkles className="h-10 w-10 animate-bounce" />
                </div>
              </div>

              {/* TITLE & DESCRIPTION */}
              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-black text-white tracking-tight">
                  Ваша «Моя волна» настроена!
                </h3>
                <p className="text-xs font-semibold text-white/60 leading-relaxed">
                  Искусственный интеллект AmyMusic изучил предпочтения по {selectedArtists.length} исполнителям и {likedTracks.length} понравившимся трекам.
                </p>
              </div>

              {/* STATS BADGES */}
              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-bold text-white/70">
                  Артисты: <strong className="text-[#FFCC00]">{selectedArtists.length}</strong>
                </span>
                <span className="px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-bold text-white/70">
                  Понравилось: <strong className="text-emerald-400">{likedTracks.length}</strong>
                </span>
                <span className="px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-bold text-white/70">
                  Пропущено: <strong className="text-rose-400">{skippedTracks.length}</strong>
                </span>
              </div>

              {/* LISTEN MY WAVE BUTTON */}
              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-3 rounded-2xl bg-[#FFCC00] px-8 py-4 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_40px_rgba(255,204,0,0.4)] transition hover:scale-105 active:scale-95 cursor-pointer mt-4"
              >
                <Radio className="h-4 w-4 fill-current animate-pulse" />
                <span>Слушать «Мою волну»</span>
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </button>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}

export default MyWaveSetupModal;
