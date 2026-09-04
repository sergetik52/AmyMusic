import React, { useEffect, useState } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";
import { getYandexChartTop100 } from "../../services/yandexMusicApi";
import { MobileActionSheet } from "./MobileActionSheet";

export function MobileTopChartsView({ onOpenArtist, onOpenAlbum }) {
  const { playTrack, currentTrack, isPlaying } = useAudioPlayer();
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionSheetTrack, setActionSheetTrack] = useState(null);

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
      .catch((err) => {
        if (!isMounted) return;
        console.error(err);
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
    <div className="flex h-full w-full flex-col">
      <div className="relative shrink-0 pt-16 px-4 pb-6 bg-gradient-to-b from-[#8341EF]/20 to-transparent">
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#8341EF]/20 px-3 py-1 mb-3 text-[11px] font-bold text-[#8341EF]">
            <img src="/trends.svg" alt="" className="h-3 w-3" />
            ТОП 100
          </div>
          <h1 className="text-4xl font-black text-white">Чарты</h1>
          <p className="mt-2 text-sm text-white/50 font-medium">Самые прослушиваемые треки</p>
          
          {tracks.length > 0 && (
            <button
              onClick={() => playTrack(tracks[0], tracks)}
              className="mt-6 flex w-[200px] items-center justify-center gap-2 rounded-full bg-[#8341EF] py-3.5 text-[15px] font-bold text-white shadow-lg active:scale-95 transition"
            >
              <img src="/play.svg" alt="" className="h-5 w-5 brightness-200" />
              Слушать
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pb-8">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-400 font-bold">{error}</div>
        ) : (
          <div className="flex flex-col gap-3">
            {tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              
              return (
                <div key={track.id} className={`flex items-center gap-3 rounded-xl p-2 transition ${isCurrent ? "bg-white/10" : "active:bg-white/5"}`}>
                  <div className="flex w-6 shrink-0 justify-center text-sm font-bold text-white/40">
                    {isCurrent && isPlaying ? (
                      <div className="flex h-3 items-end gap-0.5">
                        <div className="h-full w-1 animate-pulse bg-[#8341EF]" />
                        <div className="h-1/2 w-1 animate-pulse bg-[#8341EF]" style={{ animationDelay: "0.2s" }} />
                        <div className="h-3/4 w-1 animate-pulse bg-[#8341EF]" style={{ animationDelay: "0.4s" }} />
                      </div>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  
                  <div onClick={() => playTrack(track, tracks)} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    <img src={track.cover} alt="" className="h-full w-full object-cover" />
                  </div>
                  
                  <div onClick={() => playTrack(track, tracks)} className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className={`truncate text-[15px] font-bold ${isCurrent ? "text-[#8341EF]" : "text-white"}`}>{track.title}</p>
                    <p className="truncate text-[13px] font-medium text-white/50">{track.artist}</p>
                  </div>
                  
                  <button onClick={() => setActionSheetTrack(track)} className="p-2 shrink-0 opacity-60 active:opacity-100">
                    <span className="text-xl leading-none">•••</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {actionSheetTrack && (
        <MobileActionSheet
          track={actionSheetTrack}
          isOpen={!!actionSheetTrack}
          onClose={() => setActionSheetTrack(null)}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
        />
      )}
    </div>
  );
}
