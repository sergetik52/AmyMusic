import React, { useState, useEffect, useRef } from "react";
import { searchArtists } from "../services/soundCloudApi";

export default function WaveSeedModal({ seeds, setSeeds, onClose }) {
  const [query, setQuery] = useState("");
  const [artists, setArtists] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 280);
  };

  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setArtists([]);
      setSearchError("");
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const artistsRes = await searchArtists(normalizedQuery);
        if (!isCurrent) return;

        setArtists(artistsRes || []);
      } catch (error) {
        if (isCurrent) setSearchError("Ошибка поиска");
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 400);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query]);

  const addSeed = (item) => {
    if (seeds.some(s => s.id === item.id && s.type === item.type)) return;
    const updated = [...seeds, item];
    setSeeds(updated);
  };

  const removeSeed = (item) => {
    const updated = seeds.filter(s => !(s.id === item.id && s.type === item.type));
    setSeeds(updated);
  };

  const handleArtistClick = (a) => {
    addSeed({ id: a.id || a.username, type: "artist", name: a.name || a.username, cover: a.avatar });
  };

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col bg-black/80 backdrop-blur-xl ${isClosing ? "animate-fade-out-overlay" : "animate-fade-in-overlay"}`}>
      
      {/* HEADER & SEARCH BAR */}
      <div className="flex-none pt-12 pb-4 px-6 md:px-10 border-b border-white/[0.05]">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-2xl">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Кого будем слушать?"
              className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/20 focus:border-white/30 focus:bg-white/[0.06] rounded-[24px] pl-12 pr-12 py-3.5 md:py-4 text-[16px] md:text-[18px] text-white font-medium placeholder:text-white/30 outline-none transition-all duration-300"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          <button onClick={handleClose} className="px-6 py-3.5 bg-white text-black font-bold rounded-full hover:scale-105 active:scale-95 transition whitespace-nowrap">
            Готово
          </button>
        </div>
      </div>

      {/* SEARCH RESULTS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-10 py-6">
        {isSearching && !artists.length && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
            <svg className="w-16 h-16 text-white mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <p className="text-[18px] font-bold text-white">Найдите артистов</p>
            <p className="text-[14px] text-white mt-1 max-w-sm">Добавьте их, чтобы алгоритм подбирал музыку специально для вас.</p>
          </div>
        ) : (
          <div className="space-y-10 pb-32">
            {/* ARTISTS */}
            {artists.length > 0 && (
              <div>
                <h3 className="text-[20px] font-black text-white mb-5 tracking-tight">Артисты</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {artists.slice(0, 30).map((a, i) => {
                    const isAdded = seeds.some(s => s.id === (a.id || a.username) && s.type === "artist");
                    return (
                      <button key={`artist-${a.id || a.username}-${i}`} onClick={() => isAdded ? removeSeed({ id: a.id || a.username, type: "artist" }) : handleArtistClick(a)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-[24px] transition-all duration-300 text-center group
                        ${isAdded ? 'bg-white/10 opacity-50 cursor-not-allowed border border-white/20' : 'bg-white/[0.02] hover:bg-white/[0.06] border border-transparent'}`}>
                        <div className="relative w-full aspect-square max-w-[120px]">
                          <img src={a.avatar} className="w-full h-full rounded-full object-cover shadow-lg" alt="" />
                          {!isAdded && (
                            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 shadow-lg">
                              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </div>
                          )}
                          {isAdded && (
                            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg">
                              <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-white truncate w-full px-2">{a.name || a.username}</p>
                          <p className="text-[11px] font-medium text-white/40 mt-0.5">Артист</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SELECTED SEEDS FOOTER */}
      {seeds.length > 0 && (
        <div className="flex-none bg-black/60 backdrop-blur-2xl border-t border-white/10 p-4 md:px-10 max-h-[140px] overflow-y-auto custom-scrollbar animate-slide-up-fade">
          <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3">Выбранные источники ({seeds.length})</p>
          <div className="flex flex-wrap gap-2.5">
            {seeds.map((seed, i) => (
              <div key={`seed-${seed.type}-${seed.id}-${i}`} className="flex items-center gap-2 bg-white/10 rounded-full pl-1.5 pr-3 py-1.5 group hover:bg-white/[0.15] border border-white/5 transition">
                <img src={seed.cover || "/user.svg"} alt="" className={`h-6 w-6 shrink-0 object-cover ${seed.type === "artist" ? "rounded-full" : "rounded-md"}`} />
                <span className="text-[13px] font-bold text-white max-w-[150px] truncate">{seed.name}</span>
                <button type="button" onClick={() => removeSeed(seed)} className="text-white/40 hover:text-white transition ml-1 bg-black/20 hover:bg-black/40 rounded-full p-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
