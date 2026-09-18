import React, { useEffect, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getYandexChartTop100 } from "../services/yandexMusicApi";
import { getRecommendedTracks } from "../services/soundCloudApi";
import { TrackMenuButton } from "./TrackContextMenu";

export function TopChartsView() {
  const { playTrack, currentTrack, isPlaying, togglePlay } = useAudioPlayer();
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getYandexChartTop100()
      .then((data) => {
        if (!isMounted) return;
        if (data && data.length > 0) {
          setTracks(data);
        } else {
          setError("Не удалось загрузить чарт");
        }
      })
      .catch(async (err) => {
        if (!isMounted) return;
        try {
          const recs = await getRecommendedTracks();
          if (isMounted && recs && recs.length > 0) {
            setTracks(recs);
            setError("");
            return;
          }
        } catch (e) {
          console.error(e);
        }
        setError("Ошибка при загрузке чарта");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#000000] relative">
      {/* Header Area */}
      <div className="shrink-0 w-full flex flex-col items-center pt-4 md:pt-6 pb-4 px-4">

        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight text-center">
          Чарты
        </h1>
        <p className="mt-2 text-sm md:text-base text-white/40 font-medium text-center max-w-md">
          Самые прослушиваемые треки по версии Яндекс Музыки
        </p>

        {tracks.length > 0 && (
          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={() => playTrack(tracks[0], tracks)}
              className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-sm font-bold text-black shadow-lg transition hover:scale-105 active:scale-95"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Слушать
            </button>
          </div>
        )}
      </div>

      {/* Results Body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-0 md:px-4 pb-[140px] md:pb-32 animate-fade-in">
        {isLoading ? (
          <div className="flex justify-center p-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <p className="text-xl font-bold text-red-400">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 md:gap-1 w-full">
            {tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              
              return (
                <div
                  key={track.id}
                  className={`group relative flex items-center gap-3 md:gap-4 rounded-none md:rounded-xl px-3 py-2.5 md:p-3 transition cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.08] active:scale-[0.99] ${
                    isCurrent ? "bg-white/[0.06]" : ""
                  }`}
                  onClick={() => playTrack(track, tracks)}
                >
                  <div className="flex w-8 items-center justify-center text-lg font-bold text-white/40">
                    {isCurrent && isPlaying ? (
                      <div className="flex h-4 items-end gap-1">
                        <div className="h-full w-1 animate-pulse bg-[#8341EF]" />
                        <div className="h-1/2 w-1 animate-pulse bg-[#8341EF]" style={{ animationDelay: "0.2s" }} />
                        <div className="h-3/4 w-1 animate-pulse bg-[#8341EF]" style={{ animationDelay: "0.4s" }} />
                      </div>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    <img src={track.cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <svg className="h-5 w-5 fill-white ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                  
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-base font-bold ${isCurrent ? "text-[#8341EF]" : "text-white"}`}>
                      {track.title}
                    </span>
                    <span className="truncate text-sm font-medium text-white/50">
                      {track.artist}
                    </span>
                  </div>
                  
                  <div onClick={(e) => e.stopPropagation()}>
                    <TrackMenuButton track={track} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
