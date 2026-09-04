import React, { useEffect, useMemo, useState } from "react";
import { useAudioPlayer } from "../../audio/AudioPlayerContext";
import {
  getArtistProfile,
  getArtistTracks,
  getArtistAlbums,
  getArtistPlaylists,
  getRelatedArtists
} from "../../services/soundCloudApi";

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function MobileArtistView({ artist, onBack, onOpenArtist, onOpenAlbum, onOpenActionSheet }) {
  const { playTrack, likedTrackIds, toggleLike } = useAudioPlayer();
  const [profile, setProfile] = useState(artist);
  const [tracks, setTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [related, setRelated] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setProfile(artist);

    Promise.allSettled([
      getArtistProfile(artist),
      getArtistTracks(artist, 150),
      getArtistAlbums(artist),
      getArtistPlaylists(artist),
      getRelatedArtists(artist)
    ]).then((results) => {
      if (!isMounted) return;
      const [profRes, tracksRes, albumsRes, playlistsRes, relatedRes] = results;

      if (profRes.status === "fulfilled" && profRes.value) setProfile(profRes.value);
      if (tracksRes.status === "fulfilled") setTracks(tracksRes.value || []);
      if (albumsRes.status === "fulfilled") setAlbums(albumsRes.value || []);
      if (playlistsRes.status === "fulfilled") setPlaylists(playlistsRes.value || []);
      if (relatedRes.status === "fulfilled") setRelated(relatedRes.value || []);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [artist]);

  const popularTracks = useMemo(() => tracks.slice(0, 15), [tracks]);
  const singles = useMemo(() => albums.filter((a) => a.kind === "single" || (a.trackCount || 0) === 1), [albums]);
  const fullAlbums = useMemo(() => albums.filter((a) => a.kind !== "single" && (a.trackCount || 0) > 1), [albums]);

  const avatarSrc = profile.avatar && !profile.avatar.includes("logo.png")
    ? profile.avatar
    : (profile.cover && !profile.cover.includes("logo.png") ? profile.cover : "/user.svg");

  const handlePlayAll = (shuffle = false) => {
    if (!tracks.length) return;
    const queue = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTrack(queue[0], queue);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto mobile-scroll-container bg-[#09090b] pb-28 text-white">
      {/* Hero Header */}
      <div className="relative min-h-[300px] w-full overflow-hidden pb-6 pt-safe">
        {/* Blurred background image */}
        <div className="absolute inset-0 opacity-40 blur-2xl scale-125">
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/70 to-[#09090b]" />

        <div className="relative z-10 flex flex-col items-center px-6 pt-4 text-center">
          {/* Back button */}
          <div className="flex w-full items-center justify-start pb-4">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md active:scale-95"
            >
              <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
            </button>
          </div>

          {/* Artist Avatar */}
          <div className="relative mb-3 h-32 w-32 overflow-hidden rounded-full border-2 border-white/20 shadow-2xl">
            <img src={avatarSrc} alt={profile.name} className="h-full w-full object-cover" />
          </div>

          <h1 className="text-2xl font-black text-white">{profile.name || profile.username}</h1>
          {profile.followers > 0 && (
            <p className="mt-1 text-xs font-semibold text-white/50">
              {profile.followers.toLocaleString("ru-RU")} слушателей
            </p>
          )}

          {/* Quick Play & Shuffle Buttons */}
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
      </div>

      {/* Main Content Sections */}
      <div className="flex flex-col gap-8 px-5 pt-2">
        {/* Popular Tracks List */}
        <div>
          <h2 className="mb-3 text-lg font-black text-white">Популярные треки</h2>
          {isLoading && !tracks.length ? (
            <div className="py-6 text-center text-xs font-semibold text-white/40">Загрузка треков...</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {popularTracks.map((track, idx) => {
                const isLiked = likedTrackIds.has(track.id);
                return (
                  <div
                    key={track.id}
                    onClick={() => playTrack(track, tracks)}
                    className="flex items-center gap-3 rounded-2xl p-2.5 transition active:bg-white/10"
                  >
                    <span className="w-4 text-center text-xs font-bold text-white/30">{idx + 1}</span>
                    <img src={track.cover || "/logo.png"} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{track.title}</p>
                      <p className="truncate text-xs font-medium text-white/45">{track.artist}</p>
                    </div>

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
              })}
            </div>
          )}
        </div>

        {/* Albums Carousel */}
        {fullAlbums.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-black text-white">Альбомы</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 mobile-scroll-container">
              {fullAlbums.map((album) => (
                <div
                  key={album.id}
                  onClick={() => onOpenAlbum?.(album)}
                  className="w-36 shrink-0 cursor-pointer active:scale-95 transition"
                >
                  <div className="aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <img src={album.cover || "/logo.png"} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-white">{album.title}</p>
                  <p className="text-xs font-semibold text-white/40">{album.year || "Альбом"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Singles & EPs Carousel */}
        {singles.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-black text-white">Синглы и мини-альбомы</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 mobile-scroll-container">
              {singles.map((single) => (
                <div
                  key={single.id}
                  onClick={() => onOpenAlbum?.(single)}
                  className="w-36 shrink-0 cursor-pointer active:scale-95 transition"
                >
                  <div className="aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <img src={single.cover || "/logo.png"} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-white">{single.title}</p>
                  <p className="text-xs font-semibold text-white/40">{single.year || "Сингл"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Artists */}
        {related.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-black text-white">Похожие исполнители</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 mobile-scroll-container">
              {related.map((rel) => (
                <div
                  key={rel.id || rel.name}
                  onClick={() => onOpenArtist?.(rel)}
                  className="flex w-24 shrink-0 flex-col items-center text-center active:scale-95 transition"
                >
                  <div className="h-20 w-20 overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-md">
                    <img src={rel.avatar || "/user.svg"} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 w-full truncate text-xs font-bold text-white">{rel.name || rel.username}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
