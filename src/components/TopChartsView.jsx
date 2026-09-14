import React, { useEffect, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getYandexChartTop100 } from "../services/yandexMusicApi";
import { getRecommendedTracks } from "../services/soundCloudApi";
import { TrackMenuButton } from "./TrackContextMenu";

export function TopChartsView() {
  const { playTrack, currentTrack, isPlaying } = useAudioPlayer();
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
    <div className="flex h-full w-full flex-col overflow-y-auto overflow-x-hidden custom-scrollbar pb-[140px] md:pb-32">
      <div className="relative shrink-0 pt-4 md:pt-20 px-3 md:px-10 pb-4 md:pb-8 bg-gradient-to-b from-[#8341EF]/20 to-transparent">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#8341EF]/20 px-2.5 py-0.5 mb-2 text-xs md:text-sm font-bold text-[#8341EF]">
            <img src="/trends.svg" alt="" className="h-3.5 w-3.5" />
            ТОП 100
          </div>
          <h1 className="text-2xl md:text-[56px] font-black leading-tight text-white drop-shadow-xl tracking-tight">
            Чарты
          </h1>
          <p className="mt-1 text-xs md:text-lg text-white/60 font-medium max-w-xl leading-relaxed">
            Самые прослушиваемые треки по версии Яндекс Музыки.
          </p>
        </div>
      </div>

      <div className="flex-1 px-0 md:px-10 py-1 md:py-6">
        {isLoading ? (
          <div className="flex justify-center p-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <p className="text-xl font-bold text-red-400">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 md:gap-2">
            <div className="flex items-center gap-4 px-3 md:px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white/40">
              <div className="w-8 text-center">#</div>
              <div className="flex-1">Трек</div>
            </div>
            
            {tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              
              return (
                <div
                  key={track.id}
                  className={`group relative flex items-center gap-3 md:gap-4 rounded-none md:rounded-xl px-3 py-2.5 md:p-3 transition cursor-pointer hover:bg-white/5 active:bg-white/10 active:scale-[0.99] ${
                    isCurrent ? "bg-white/10 border-y md:border border-white/10" : "border-b border-white/[0.02] md:border-transparent"
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
                    <img src={track.cover} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100 cursor-pointer">
                      <img src="/play.svg" alt="" className="h-6 w-6 brightness-200" />
                    </div>
                  </div>
                  
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-base font-bold ${isCurrent ? "text-[#8341EF]" : "text-white"}`}>
                      {track.title}
                    </span>
                    <span className="truncate text-sm font-medium text-white/60">
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
