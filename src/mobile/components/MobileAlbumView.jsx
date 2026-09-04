import React, { useEffect, useState } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";
import { getAlbumDetails } from "../../services/soundCloudApi";

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function MobileAlbumView({ album, onBack, onOpenArtist, onOpenActionSheet }) {
  const { playTrack, likedTrackIds, toggleLike } = useAudioPlayer();
  const [fullAlbum, setFullAlbum] = useState(album);
  const [isLoading, setIsLoading] = useState(!album.tracks?.length);

  useEffect(() => {
    let isMounted = true;
    setFullAlbum(album);

    if (!album.tracks?.length || album.tracks.some((t) => !t.streamUrl)) {
      setIsLoading(true);
      getAlbumDetails(album)
        .then((res) => {
          if (isMounted && res) setFullAlbum(res);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [album]);

  const tracks = fullAlbum.tracks || [];

  const handlePlayAll = (shuffle = false) => {
    if (!tracks.length) return;
    const queue = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTrack(queue[0], queue);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto mobile-scroll-container bg-[#09090b] pb-28 text-white">
      {/* Top Bar with Back Button */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-[#09090b]/80 px-4 py-3 backdrop-blur-xl ios-safe-top">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
        >
          <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
        </button>
        <span className="truncate max-w-[200px] text-sm font-bold text-white/80">{fullAlbum.title}</span>
        <div className="w-10" />
      </div>

      {/* Album Hero Info */}
      <div className="flex flex-col items-center px-6 pt-6 text-center">
        <div className="relative aspect-square w-56 max-w-[220px] overflow-hidden rounded-[24px] border border-white/10 shadow-2xl">
          <img src={fullAlbum.cover || "/logo.png"} alt="" className="h-full w-full object-cover" />
        </div>

        <h1 className="mt-4 text-xl font-black text-white">{fullAlbum.title}</h1>
        <button
          type="button"
          onClick={() => {
            if (onOpenArtist && fullAlbum.artist) {
              onOpenArtist({ name: fullAlbum.artist, username: fullAlbum.artist });
            }
          }}
          className="mt-1 text-sm font-bold text-white/60 hover:text-white"
        >
          {fullAlbum.artist}
        </button>
        <p className="mt-0.5 text-xs font-semibold text-white/40">
          {fullAlbum.year ? `${fullAlbum.year} • ` : ""}
          {tracks.length} треков
        </p>

        {/* Action Buttons */}
        <div className="mt-5 flex w-full max-w-xs items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => handlePlayAll(false)}
            disabled={!tracks.length}
            className="flex-1 flex items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-black text-black shadow-lg transition active:scale-95 disabled:opacity-40"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            <span>Слушать</span>
          </button>
          <button
            type="button"
            onClick={() => handlePlayAll(true)}
            disabled={!tracks.length}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition active:scale-95 disabled:opacity-40"
            aria-label="Перемешать"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
          </button>
        </div>
      </div>

      {/* Tracklist */}
      <div className="mt-6 flex flex-col gap-1 px-4">
        {isLoading && !tracks.length ? (
          <div className="py-8 text-center text-xs font-bold text-white/40">Загрузка альбома...</div>
        ) : (
          tracks.map((track, idx) => {
            const isLiked = likedTrackIds.has(track.id);
            return (
              <div
                key={track.id}
                onClick={() => playTrack(track, tracks)}
                className="flex items-center gap-3 rounded-2xl p-2.5 transition active:bg-white/10"
              >
                <span className="w-5 text-center text-xs font-bold text-white/30">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{track.title}</p>
                  <p className="truncate text-xs font-medium text-white/45">{track.artist}</p>
                </div>

                <span className="text-xs font-semibold text-white/30">{formatDuration(track.duration)}</span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(track.id, track);
                  }}
                  className="flex h-9 w-9 items-center justify-center text-white/40 active:scale-90"
                >
                  <img src={isLiked ? "/like.svg" : "/unlike.svg"} alt="" className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenActionSheet?.(track);
                  }}
                  className="flex h-9 w-9 items-center justify-center text-white/40 active:scale-90"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
