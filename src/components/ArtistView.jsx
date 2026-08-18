import React, { useEffect, useMemo, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import {
  getAlbumDetails,
  getArtistAlbums,
  getArtistPlaylists,
  getArtistProfile,
  getArtistTracks,
  getRelatedArtists,
  searchArtists
} from "../services/soundCloudApi";
import { useEscapeKey } from "../utils/useEscapeKey";
import { HorizontalScrollSection } from "./HorizontalScrollSection";
import { TrackMenuButton } from "./TrackContextMenu";

function formatCount(value) {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function sortByPopularity(tracks) {
  return [...tracks].sort((a, b) => {
    const playsDiff = (b.playbackCount || 0) - (a.playbackCount || 0);
    if (playsDiff !== 0) return playsDiff;
    return (b.likesCount || 0) - (a.likesCount || 0);
  });
}

function shuffleList(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function isFeatureTrack(track, artistName = "") {
  const title = String(track.title || "");
  const artist = String(track.artist || "");
  const profileName = String(artistName || "").toLowerCase();
  const text = `${title} ${artist}`.toLowerCase();
  const hasFeatureMarker = /\b(feat|ft|featuring|with)\.?\b|\sx\s|[,+/&]/i.test(text);
  const artistParts = artist
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|;)\s*/i)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (artistParts.length > 1) return true;
  if (!hasFeatureMarker) return false;
  if (!profileName) return true;
  return text.includes(profileName) || artist === profileName;
}

function SectionTitle({ children, onClick, expanded }) {
  const Component = onClick ? "button" : "h2";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="mb-4 flex items-center gap-2 text-left text-2xl font-black text-white transition hover:text-white/80"
    >
      <span>{children}</span>
      {onClick && <span className="text-lg text-white/35">{expanded ? "свернуть" : "›"}</span>}
    </Component>
  );
}

function TrackSquare({ track, onPlay }) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track)}
      className="group w-40 shrink-0 text-left"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04]">
        <img src={track.cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
      </div>
      <p className="mt-2 truncate text-sm font-black text-white">{track.title}</p>
      <p className="truncate text-xs font-semibold text-white/35">{track.artist}</p>
    </button>
  );
}

function AlbumCard({ album, onOpen, isSaved = false, onToggleSave }) {
  const isSingle = album.kind === "single" || (album.trackCount || album.tracks?.length) === 1;

  return (
    <div className="group w-40 shrink-0 text-left">
      <button
        type="button"
        onClick={() => onOpen(album)}
        className="block w-full text-left"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04]">
          <img src={album.cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
          {isSingle && (
            <div className="absolute top-2 left-2 rounded-md bg-[#8341EF]/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-md backdrop-blur-sm">
              Сингл
            </div>
          )}
          <div className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white/70">
            {album.trackCount || album.tracks?.length || 0}
          </div>
        </div>
      </button>
      <div className="mt-2 flex items-start gap-2">
        <button type="button" onClick={() => onOpen(album)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-black text-white">{album.title}</p>
          <p className="truncate text-xs font-semibold text-white/35">{isSingle ? "Сингл" : (formatDate(album.createdAt) || album.artist)}</p>
        </button>
        <button
          type="button"
          onClick={() => onToggleSave?.(album)}
          className={[
            "grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-white/[0.07] active:scale-95",
            isSaved ? "opacity-100" : "opacity-45 hover:opacity-85"
          ].join(" ")}
          aria-label={isSaved ? "Убрать из коллекции" : "Добавить в коллекцию"}
          title={isSaved ? "Убрать из коллекции" : "Добавить в коллекцию"}
        >
          <img src={isSaved ? "/like.svg" : "/unlike.svg"} alt="" className={`h-4 w-4 ${isSaved ? "" : "brightness-200"}`} />
        </button>
      </div>
    </div>
  );
}

function TrackRow({
  track,
  index,
  onPlay,
  showCover = true,
  showLike = false,
  isLiked = false,
  onToggleLike,
  onOpenArtist,
  onOpenAlbum
}) {
  return (
    <div className="group flex w-full items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => onPlay(track)}
        disabled={!track.streamUrl}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default disabled:opacity-45"
      >
        <span className="w-7 text-right text-xs font-black text-white/25">{index + 1}</span>
        {showCover && <img src={track.cover} alt="" className="h-11 w-11 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{track.title}</p>
          <p className="truncate text-xs font-semibold text-white/35">
            {track.streamUrl ? track.artist : `${track.artist} · недоступно`}
          </p>
        </div>
      </button>

      {showLike && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleLike?.(track);
          }}
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/[0.07] active:scale-95",
            isLiked ? "opacity-100" : "opacity-45 hover:opacity-85"
          ].join(" ")}
          aria-label={isLiked ? "Убрать лайк" : "Лайкнуть трек"}
          title={isLiked ? "Убрать лайк" : "Лайкнуть трек"}
        >
          <img
            src={isLiked ? "/like.svg" : "/unlike.svg"}
            alt=""
            className={`h-5 w-5 ${isLiked ? "" : "brightness-200"}`}
          />
        </button>
      )}

      <div className="relative w-10 h-10 flex items-center justify-end shrink-0 select-none">
        <span className="text-xs font-semibold text-white/30 group-hover:opacity-0 transition-opacity duration-150 pr-2">
          {formatDuration(track.duration)}
        </span>
        <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <TrackMenuButton
            track={track}
            onOpenArtist={onOpenArtist}
            onOpenAlbum={onOpenAlbum}
          />
        </div>
      </div>
    </div>
  );
}

function RelatedArtistCard({ artist, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(artist)}
      className="group w-36 shrink-0 text-center"
    >
      <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
        <img src={artist.avatar} alt={artist.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
      </div>
      <p className="mt-3 truncate text-sm font-black text-white">{artist.username || artist.name}</p>
      <p className="truncate text-xs font-semibold text-white/35">{formatCount(artist.followers)} подписчиков</p>
    </button>
  );
}

function AlbumView({
  album,
  artist,
  isLoading,
  likedTrackIds,
  isReleaseSaved,
  onBack,
  onPlayAlbum,
  onShufflePlay,
  onPlayTrack,
  onToggleLike,
  onToggleRelease,
  onOpenArtist,
  onOpenAlbum
}) {
  const tracks = album.tracks || [];
  const totalDuration = tracks.reduce((total, track) => total + (track.duration || 0), 0);
  const isSingle = album.kind === "single" || album.trackCount === 1 || tracks.length === 1;
  const releaseType = isSingle ? "Сингл" : album.kind === "playlist" ? "Плейлист" : "Альбом";

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#070707] text-white shadow-2xl">
      <div className="relative min-h-[315px] overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5">
        <div className="absolute inset-0 opacity-30 blur-3xl">
          <img src={album.cover} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-[#080808]/82 to-[#070707]" />

        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7">
            <img src={album.cover} alt={album.title} className="h-56 w-56 shrink-0 rounded-3xl border border-white/10 object-cover shadow-2xl" />
            <div className="max-w-4xl pb-2">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/35">{releaseType}</p>
              <h1 className="text-5xl font-black tracking-tight text-white">{album.title}</h1>
              <p className="mt-2 text-base font-bold text-white/48">{album.artist || artist.username || artist.name}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold text-white/38">
                <span>{tracks.length || album.trackCount || 0} треков</span>
                {totalDuration > 0 && <span>{Math.round(totalDuration / 60)} мин</span>}
                {album.createdAt && <span>{formatDate(album.createdAt)}</span>}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button type="button" onClick={onPlayAlbum} disabled={!tracks.length} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40">
                  ▶ Слушать все
                </button>
                <button
                  type="button"
                  onClick={() => onToggleRelease?.(album)}
                  className={[
                    "grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] active:scale-95",
                    isReleaseSaved ? "opacity-100" : "opacity-55 hover:opacity-90"
                  ].join(" ")}
                  aria-label={isReleaseSaved ? "Убрать альбом из коллекции" : "Добавить альбом в коллекцию"}
                  title={isReleaseSaved ? "Убрать альбом из коллекции" : "Добавить альбом в коллекцию"}
                >
                  <img src={isReleaseSaved ? "/like.svg" : "/unlike.svg"} alt="" className={`h-5 w-5 ${isReleaseSaved ? "" : "brightness-200"}`} />
                </button>
                <button
                  type="button"
                  onClick={onShufflePlay}
                  disabled={!tracks.length}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-35"
                  aria-label="Перемешать альбом и слушать"
                  title="Перемешать альбом и слушать"
                >
                  <img src="/shuffle.svg" alt="" className="h-5 w-5 brightness-200 opacity-70" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-7">
        {isLoading && <p className="mb-4 text-sm font-bold text-white/35">Догружаю треки альбома...</p>}
        {tracks.length > 0 ? (
          <div className="space-y-1">
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id || `${album.id}-${index}`}
                track={track}
                index={index}
                showCover={false}
                showLike
                isLiked={likedTrackIds.has(track.id)}
                onToggleLike={onToggleLike}
                onPlay={(nextTrack) => onPlayTrack(nextTrack, tracks)}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-[220px] place-items-center text-center">
            <p className="text-sm font-bold text-white/35">Треки альбома не загрузились</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ArtistTracksView({ artist, tracks, isLoading, onBack, onPlayTrack, likedTrackIds, onToggleLike, onOpenArtist, onOpenAlbum }) {
  const sortedTracks = useMemo(() => sortByPopularity(tracks), [tracks]);
  const playableTracks = sortedTracks.filter((track) => track.streamUrl);

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#070707] text-white shadow-2xl">
      <div className="sticky top-0 z-10 border-b border-white/[0.05] bg-[#070707]/92 px-7 py-5 backdrop-blur-xl">
        <button 
          type="button" 
          onClick={onBack} 
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
          aria-label="Назад"
        >
          <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
        </button>
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/30">Все треки</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-white">{artist.username || artist.name}</h1>
            <p className="mt-2 text-sm font-bold text-white/38">
              {sortedTracks.length} треков · от популярных к менее популярным
            </p>
          </div>
          <button
            type="button"
            onClick={() => playableTracks[0] && onPlayTrack(playableTracks[0], playableTracks)}
            disabled={!playableTracks.length}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40"
          >
            ▶ Слушать все
          </button>
        </div>
      </div>

      <div className="p-7">
        {isLoading && <p className="mb-4 text-sm font-bold text-white/35">Загружаю треки артиста...</p>}
        <div className="space-y-1">
          {sortedTracks.map((track, index) => (
            <TrackRow
              key={track.id || `${track.title}-${index}`}
              track={track}
              index={index}
              showLike={true}
              isLiked={likedTrackIds.has(track.id)}
              onToggleLike={(t) => onToggleLike(t.id, t)}
              onPlay={(nextTrack) => onPlayTrack(nextTrack, playableTracks.length ? playableTracks : sortedTracks)}
              onOpenArtist={onOpenArtist}
              onOpenAlbum={onOpenAlbum}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ArtistView({ artist, onBack, onOpenArtist, initialAlbum }) {
  const {
    likedTrackIds,
    savedReleaseIds,
    playTrack,
    toggleLike,
    toggleSavedRelease
  } = useAudioPlayer();
  const [profile, setProfile] = useState(artist);
  const [tracks, setTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllAlbums, setShowAllAlbums] = useState(false);
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState(artist?.initialAlbum || initialAlbum || null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [isTracksViewOpen, setIsTracksViewOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");
    setProfile(artist);
    setTracks([]);
    setAlbums([]);
    setPlaylists([]);
    setRelatedArtists([]);
    setShowAllAlbums(false);
    setShowAllPlaylists(false);
    setActiveAlbum(artist?.initialAlbum || initialAlbum || null);
    setIsAlbumLoading(false);
    setIsTracksViewOpen(false);

    async function loadArtist() {
      let resolvedArtist = artist;
      if (!resolvedArtist?.id && (resolvedArtist?.username || resolvedArtist?.name)) {
        try {
          const foundArtists = await searchArtists(resolvedArtist.username || resolvedArtist.name);
          resolvedArtist = foundArtists[0] || resolvedArtist;
          if (isMounted) setProfile(resolvedArtist);
        } catch {
          resolvedArtist = artist;
        }
      }

      return Promise.allSettled([
        getArtistProfile(resolvedArtist),
        getArtistTracks(resolvedArtist, 200),
        getArtistAlbums(resolvedArtist),
        getArtistPlaylists(resolvedArtist),
        getRelatedArtists(resolvedArtist)
      ]);
    }

    loadArtist().then((results) => {
      if (!isMounted) return;

      const [profileResult, tracksResult, albumsResult, playlistsResult, relatedResult] = results;
      if (profileResult.status === "fulfilled") setProfile(profileResult.value);
      if (tracksResult.status === "fulfilled") setTracks(tracksResult.value);
      
      let loadedAlbums = [];
      if (albumsResult.status === "fulfilled") {
        loadedAlbums = albumsResult.value || [];
        setAlbums(loadedAlbums);
      }

      if (playlistsResult.status === "fulfilled") {
        const albumIds = new Set(loadedAlbums.map((a) => String(a.id)));
        const albumTitles = new Set(loadedAlbums.map((a) => String(a.title).toLowerCase().trim()));
        const uniquePlaylists = (playlistsResult.value || []).filter((p) => {
          return !albumIds.has(String(p.id)) && !albumTitles.has(String(p.title).toLowerCase().trim());
        });
        setPlaylists(uniquePlaylists);
      }
      if (relatedResult.status === "fulfilled") setRelatedArtists(relatedResult.value);
      if (tracksResult.status === "rejected") {
        setError(tracksResult.reason?.message || "Не удалось загрузить треки артиста");
      }
    }).finally(() => {
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [artist]);

  const sortedTracks = useMemo(() => sortByPopularity(tracks), [tracks]);
  const popularTracks = useMemo(() => sortedTracks.slice(0, 10), [sortedTracks]);
  const featureTracks = useMemo(
    () => sortedTracks.filter((track) => isFeatureTrack(track, profile.username || profile.name)).slice(0, 12),
    [profile.name, profile.username, sortedTracks]
  );
  const previewTracks = useMemo(() => sortedTracks.slice(0, 10), [sortedTracks]);
  const fullAlbums = useMemo(() => albums.filter((a) => a.kind !== "single" && (a.trackCount || a.tracks?.length || 0) > 1), [albums]);
  const singleReleases = useMemo(() => albums.filter((a) => a.kind === "single" || (a.trackCount || a.tracks?.length || 0) === 1), [albums]);
  const visibleAlbums = showAllAlbums ? fullAlbums : fullAlbums.slice(0, 5);
  const visibleSingles = showAllAlbums ? singleReleases : singleReleases.slice(0, 5);
  const visiblePlaylists = showAllPlaylists ? playlists : playlists.slice(0, 5);
  const tags = profile.tags?.length ? profile.tags : tracks.map((track) => track.mood).filter(Boolean).slice(0, 3);

  const handlePlayTrack = (track, queue = sortedTracks) => {
    const playableQueue = queue.filter((item) => item.streamUrl);
    playTrack(track, playableQueue.length ? playableQueue : [track]);
  };

  const openAlbum = async (album) => {
    setActiveAlbum(album);
    if (album.tracks && album.tracks.length > 0) {
      return;
    }
    setIsAlbumLoading(true);
    const fullAlbum = await getAlbumDetails(album, profile);
    setActiveAlbum(fullAlbum);
    setIsAlbumLoading(false);
  };

  useEscapeKey(Boolean(activeAlbum), () => setActiveAlbum(null));
  useEscapeKey(!activeAlbum && isTracksViewOpen, () => setIsTracksViewOpen(false));
  useEscapeKey(!activeAlbum && !isTracksViewOpen, onBack);

  if (activeAlbum) {
    return (
      <AlbumView
        album={activeAlbum}
        artist={profile}
        isLoading={isAlbumLoading}
        likedTrackIds={likedTrackIds}
        isReleaseSaved={savedReleaseIds.has(activeAlbum.id)}
        onBack={() => setActiveAlbum(null)}
        onPlayAlbum={() => {
          const playableTracks = activeAlbum.tracks?.filter((track) => track.streamUrl) || [];
          if (playableTracks[0]) playTrack(playableTracks[0], playableTracks);
        }}
        onShufflePlay={() => {
          const playableTracks = activeAlbum.tracks?.filter((track) => track.streamUrl) || [];
          const shuffledTracks = shuffleList(playableTracks);
          if (shuffledTracks[0]) playTrack(shuffledTracks[0], shuffledTracks);
        }}
        onPlayTrack={handlePlayTrack}
        onToggleLike={(track) => toggleLike(track.id, track)}
        onToggleRelease={toggleSavedRelease}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={setActiveAlbum}
      />
    );
  }

  if (isTracksViewOpen) {
    return (
      <ArtistTracksView
        artist={profile}
        tracks={sortedTracks}
        isLoading={isLoading}
        onBack={() => setIsTracksViewOpen(false)}
        onPlayTrack={handlePlayTrack}
        likedTrackIds={likedTrackIds}
        onToggleLike={toggleLike}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={setActiveAlbum}
      />
    );
  }

  return (
    <section className="flex-1 overflow-y-auto rounded-[17.76px] border border-white/[0.04] bg-[#090909] text-white shadow-2xl">
      <div className="relative min-h-[330px] overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5">
        <div className="absolute inset-0 opacity-45 blur-3xl">
          <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/78 to-[#090909]" />

        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7">
            <img src={profile.avatar} alt={profile.name} className="h-52 w-52 shrink-0 rounded-full border border-white/10 object-cover shadow-2xl" />
            <div className="max-w-4xl pb-2">
              <h1 className="text-5xl font-black tracking-tight text-white">{profile.username || profile.name}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-white/45">
                <span>{formatCount(profile.trackCount || tracks.length)} треков</span>
                <span>{formatCount(profile.followers)} подписчиков</span>
                {profile.city && <span>{profile.city}</span>}
              </div>
              {profile.description && (
                <p className="mt-4 max-w-3xl line-clamp-2 text-sm font-semibold leading-relaxed text-white/45">
                  {profile.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => sortedTracks[0] && handlePlayTrack(sortedTracks[0], sortedTracks)} disabled={!sortedTracks.length} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40">
                  ▶ Слушать все
                </button>
                {tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-bold text-white/45">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-7">
        {error && <p className="text-sm font-semibold text-red-300">{error}</p>}
        {isLoading && !tracks.length && <p className="text-sm font-bold text-white/40">Загружаю артиста...</p>}

        {popularTracks.length > 0 && (
          <HorizontalScrollSection title="Популярные">
            {popularTracks.map((track) => (
              <TrackSquare key={track.id} track={track} onPlay={(nextTrack) => handlePlayTrack(nextTrack, sortedTracks)} />
            ))}
          </HorizontalScrollSection>
        )}

        {previewTracks.length > 0 && (
          <section className="mt-8">
            <SectionTitle onClick={() => setIsTracksViewOpen(true)}>Треки</SectionTitle>
            {(() => {
              const leftTracks = [];
              const rightTracks = [];
              previewTracks.forEach((track, index) => {
                const chunkIndex = Math.floor(index / 5);
                if (chunkIndex % 2 === 0) {
                  leftTracks.push({ track, originalIndex: index });
                } else {
                  rightTracks.push({ track, originalIndex: index });
                }
              });

              const renderTrackRow = ({ track, originalIndex }) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={originalIndex}
                  showLike={true}
                  isLiked={likedTrackIds.has(track.id)}
                  onToggleLike={(t) => toggleLike(t.id, t)}
                  onPlay={(nextTrack) => handlePlayTrack(nextTrack, sortedTracks)}
                  onOpenArtist={onOpenArtist}
                  onOpenAlbum={setActiveAlbum}
                />
              );

              return (
                <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    {leftTracks.map(renderTrackRow)}
                  </div>
                  <div className="flex flex-col gap-1">
                    {rightTracks.map(renderTrackRow)}
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {featureTracks.length > 0 && (
          <HorizontalScrollSection title="Фиты">
            {featureTracks.map((track) => (
              <TrackSquare key={track.id} track={track} onPlay={(nextTrack) => handlePlayTrack(nextTrack, sortedTracks)} />
            ))}
          </HorizontalScrollSection>
        )}

        {fullAlbums.length > 0 && (
          <HorizontalScrollSection title={
            <button onClick={() => setShowAllAlbums((value) => !value)} className="flex items-center gap-2 transition hover:text-white/80">
              <span>Альбомы</span>
              <span className="text-lg text-white/35">{showAllAlbums ? "свернуть" : "›"}</span>
            </button>
          }>
            {visibleAlbums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                onOpen={openAlbum}
                isSaved={savedReleaseIds.has(album.id)}
                onToggleSave={toggleSavedRelease}
              />
            ))}
          </HorizontalScrollSection>
        )}

        {singleReleases.length > 0 && (
          <HorizontalScrollSection title="Синглы и EP">
            {visibleSingles.map((single) => (
              <AlbumCard
                key={single.id}
                album={single}
                onOpen={openAlbum}
                isSaved={savedReleaseIds.has(single.id)}
                onToggleSave={toggleSavedRelease}
              />
            ))}
          </HorizontalScrollSection>
        )}

        {playlists.length > 0 && (
          <HorizontalScrollSection title={
            <button onClick={() => setShowAllPlaylists((value) => !value)} className="flex items-center gap-2 transition hover:text-white/80">
              <span>Плейлисты</span>
              <span className="text-lg text-white/35">{showAllPlaylists ? "свернуть" : "›"}</span>
            </button>
          }>
            {visiblePlaylists.map((playlist) => (
              <AlbumCard
                key={playlist.id}
                album={playlist}
                onOpen={openAlbum}
                isSaved={savedReleaseIds.has(playlist.id)}
                onToggleSave={toggleSavedRelease}
              />
            ))}
          </HorizontalScrollSection>
        )}

        {relatedArtists.length > 0 && (
          <HorizontalScrollSection title="Похожие артисты">
            {relatedArtists.map((related) => (
              <RelatedArtistCard key={related.id || related.username} artist={related} onOpen={onOpenArtist} />
            ))}
          </HorizontalScrollSection>
        )}
      </div>
    </section>
  );
}
