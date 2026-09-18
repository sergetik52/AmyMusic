import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import {
  getAlbumDetails,
  getArtistAlbums,
  getArtistPlaylists,
  getArtistProfile,
  getArtistTracks,
  getRelatedArtists,
  searchArtists,
  searchTracks
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
  const hasFeatureMarker = /\b(feat|ft|featuring|with)\.?\b|при\s+уч(?:\.|астии)?|\bуч\.?|\sx\s|[,+/&]/i.test(text);
  const artistParts = artist
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|при\s+уч(?:\.|астии)?|\bуч\.?|;)\s*/i)
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
    <div className="group flex w-full items-center gap-3 rounded-xl p-2 max-md:px-2 max-md:py-2.5 max-md:rounded-none transition hover:bg-white/[0.04]">
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

function formatRussianDate(rawDate) {
  if (!rawDate) return "";
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return String(rawDate);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }) + " г.";
}

function LatestReleaseCard({ release, artist, onOpen, isSaved, onToggleSave }) {
  const isAlbum = Boolean(release.tracks || release.trackCount > 1 || release.isAlbum);
  const coverSrc = release.cover || release.artworkUrl || release.artwork_url || artist.avatar || "/user.svg";
  const releaseTitle = release.title || release.name || "Релиз";
  const releaseDate = formatRussianDate(release.createdAt || release.releasedAt || release.created_at);
  const typeLabel = isAlbum ? (release.setType === "album" || release.kind === "album" ? "Альбом" : "EP") : "Сингл";

  return (
    <div
      onClick={() => onOpen(release)}
      className="group relative flex w-full max-w-xs flex-col cursor-pointer text-left max-md:mx-auto"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white/[0.04]">
        <img
          src={coverSrc}
          alt={releaseTitle}
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/user.svg"; }}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
            <span className="text-xl font-bold ml-1">▶</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-white/40 uppercase tracking-wider">{typeLabel} • {releaseDate}</span>
          <h4 className="mt-0.5 font-black text-base text-white truncate group-hover:text-white/80">{releaseTitle}</h4>
          <p className="text-xs font-semibold text-white/50 truncate mt-0.5">{artist.username || artist.name}</p>
        </div>

        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(release);
            }}
            className={[
              "grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-white/[0.07] active:scale-95",
              isSaved ? "opacity-100" : "opacity-45 hover:opacity-85"
            ].join(" ")}
            aria-label={isSaved ? "Убрать из коллекции" : "Добавить в коллекцию"}
            title={isSaved ? "Убрать из коллекции" : "Добавить в коллекцию"}
          >
            <img src={isSaved ? "/like.svg" : "/unlike.svg"} alt="" className={`h-4 w-4 ${isSaved ? "" : "brightness-200"}`} />
          </button>
        )}
      </div>
    </div>
  );
}

function RelatedArtistCard({ artist, onOpen }) {
  const avatarSrc = (artist.avatar && !artist.avatar.includes("logo.png"))
    ? artist.avatar
    : ((artist.cover && !artist.cover.includes("logo.png")) ? artist.cover : "/user.svg");

  return (
    <button
      type="button"
      onClick={() => onOpen(artist)}
      className="group w-36 shrink-0 text-center"
    >
      <div className="mx-auto h-32 w-32 overflow-hidden rounded-full bg-white/[0.04]">
        <img
          src={avatarSrc}
          alt={artist.name}
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/user.svg"; }}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </div>
      <p className="mt-3 truncate text-sm font-black text-white">{artist.username || artist.name}</p>
      <p className="truncate text-xs font-semibold text-white/35">{formatCount(artist.followers)} подписчиков</p>
    </button>
  );
}

export function AlbumView({
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
    <section className="flex-1 overflow-y-auto rounded-[17.76px] max-md:rounded-none max-md:border-none border border-white/[0.04] bg-[#070707] text-white shadow-2xl pb-[140px] md:pb-12">
      <div className="relative min-h-[315px] max-md:min-h-0 overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5 max-md:px-4 max-md:pb-3 max-md:pt-2">
        <div className="absolute inset-0 opacity-30 blur-3xl">
          <img src={album.cover} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-[#080808]/82 to-[#070707]" />

        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 max-md:mb-2 flex h-10 w-10 max-md:h-8 max-md:w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7 max-md:flex-col max-md:items-center max-md:text-center max-md:gap-4">
            <img src={album.cover} alt={album.title} className="h-56 w-56 max-md:h-56 max-md:w-56 shrink-0 rounded-3xl object-cover shadow-2xl" />
            <div className="max-w-4xl pb-2 max-md:flex max-md:flex-col max-md:items-center max-md:w-full">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/35 max-md:text-center">{releaseType}</p>
              <h1 className="text-5xl max-md:text-2xl font-black tracking-tight text-white max-md:text-center break-words">{album.title}</h1>
              {onOpenArtist ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenArtist(
                      artist?.id
                        ? artist
                        : {
                            id: album.artistId || "",
                            username: album.artist || artist?.username || artist?.name,
                            name: album.artist || artist?.name || artist?.username
                          }
                    )
                  }
                  className="mt-2 text-left max-md:text-center text-base max-md:text-sm font-bold text-white/60 transition hover:text-white hover:underline"
                >
                  {album.artist || artist?.username || artist?.name}
                </button>
              ) : (
                <p className="mt-2 text-base max-md:text-sm font-bold text-white/48 max-md:text-center">{album.artist || artist?.username || artist?.name}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold text-white/38 max-md:justify-center max-md:text-xs">
                <span>{tracks.length || album.trackCount || 0} треков</span>
                {totalDuration > 0 && <span>{Math.round(totalDuration / 60)} мин</span>}
                {album.createdAt && <span>{formatDate(album.createdAt)}</span>}
              </div>

              <div className="mt-6 flex flex-row items-center gap-3 max-md:justify-center max-md:w-full">
                <button type="button" onClick={onPlayAlbum} disabled={!tracks.length} className="rounded-full bg-white px-5 py-2.5 max-md:px-4 max-md:py-2 text-sm max-md:text-xs font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40 whitespace-nowrap shrink-0">
                  ▶ Слушать все
                </button>
                <button
                  type="button"
                  onClick={() => onToggleRelease?.(album)}
                  className={[
                    "grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] active:scale-95 shrink-0",
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
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-35 shrink-0"
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

      <div className="p-7 max-md:px-2 max-md:py-2">
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
    <section className="flex-1 overflow-y-auto rounded-[17.76px] max-md:rounded-none max-md:border-none border border-white/[0.04] bg-[#070707] text-white shadow-2xl">
      <div className="sticky top-0 z-10 border-b border-white/[0.05] bg-[#070707]/92 px-7 py-5 max-md:px-4 max-md:py-2 backdrop-blur-xl">
        <button 
          type="button" 
          onClick={onBack} 
          className="mb-4 max-md:mb-1.5 flex h-10 w-10 max-md:h-8 max-md:w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
          aria-label="Назад"
        >
          <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
        </button>
        <div className="flex items-end justify-between gap-5 max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/30">Все треки</p>
            <h1 className="mt-1 text-4xl max-md:text-2xl font-black tracking-tight text-white">{artist.username || artist.name}</h1>
            <p className="mt-2 text-sm font-bold text-white/38">
              {sortedTracks.length} треков · от популярных к менее популярным
            </p>
          </div>
          <button
            type="button"
            onClick={() => playableTracks[0] && onPlayTrack(playableTracks[0], playableTracks)}
            disabled={!playableTracks.length}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40 max-md:w-full"
          >
            ▶ Слушать все
          </button>
        </div>
      </div>

      <div className="p-7 max-md:px-2 max-md:py-2">
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
  const [activeAlbum, setActiveAlbum] = useState(artist?.initialAlbum || initialAlbum || null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [isTracksViewOpen, setIsTracksViewOpen] = useState(false);
  const popularScrollRef = useRef(null);

  const scrollPopLeft = () => {
    if (popularScrollRef.current) {
      popularScrollRef.current.scrollBy({
        left: -popularScrollRef.current.clientWidth,
        behavior: "smooth"
      });
    }
  };

  const scrollPopRight = () => {
    if (popularScrollRef.current) {
      popularScrollRef.current.scrollBy({
        left: popularScrollRef.current.clientWidth,
        behavior: "smooth"
      });
    }
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");
    setProfile(artist);
    setTracks([]);
    setAlbums([]);
    setPlaylists([]);
    setRelatedArtists([]);
    setActiveAlbum(artist?.initialAlbum || initialAlbum || null);
    setIsAlbumLoading(false);
    setIsTracksViewOpen(false);

    async function loadArtist() {
      const results = await Promise.allSettled([
        getArtistProfile(artist),
        getArtistTracks(artist, 100),
        getArtistAlbums(artist),
        getArtistPlaylists(artist),
        getRelatedArtists(artist)
      ]);

      if (!isMounted) return;

      const [profileResult, tracksResult, albumsResult, playlistsResult, relatedResult] = results;

      if (profileResult.status === "fulfilled" && profileResult.value) {
        setProfile(profileResult.value);
      }

      const directTracks = tracksResult.status === "fulfilled" ? tracksResult.value || [] : [];
      setTracks(directTracks);

      const loadedAlbums = albumsResult.status === "fulfilled" ? albumsResult.value || [] : [];
      setAlbums(loadedAlbums);

      if (playlistsResult.status === "fulfilled") {
        const albumIds = new Set(loadedAlbums.map((a) => String(a.id)));
        const uniquePlaylists = (playlistsResult.value || []).filter((p) => !albumIds.has(String(p.id)));
        setPlaylists(uniquePlaylists);
      }

      if (relatedResult.status === "fulfilled") {
        setRelatedArtists(relatedResult.value || []);
      }
    }

    loadArtist().finally(() => {
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
  const tags = profile.tags?.length ? profile.tags : tracks.map((track) => track.mood).filter(Boolean).slice(0, 3);

  const latestRelease = useMemo(() => {
    const allReleases = [...albums];
    if (!allReleases.length && tracks.length) {
      const latestTrack = [...tracks].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      if (latestTrack) return latestTrack;
    }
    if (!allReleases.length) return null;
    return allReleases.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  }, [albums, tracks]);

  const handlePlayTrack = (track, queue = sortedTracks) => {
    const playableQueue = queue.filter((item) => item.streamUrl);
    playTrack(track, playableQueue.length ? playableQueue : [track]);
  };

  const openAlbum = async (album) => {
    if (album.streamUrl && !album.tracks) {
      handlePlayTrack(album);
      return;
    }
    setActiveAlbum(album);
    setIsAlbumLoading(true);
    try {
      const fullAlbum = await getAlbumDetails(album, profile);
      if (fullAlbum) {
        setActiveAlbum(fullAlbum);
      }
    } catch (err) {
      console.warn("openAlbum getAlbumDetails failed", err);
    } finally {
      setIsAlbumLoading(false);
    }
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

  const profileAvatar = (profile.avatar && !profile.avatar.includes("logo.png"))
    ? profile.avatar
    : ((profile.cover && !profile.cover.includes("logo.png")) ? profile.cover : "/user.svg");

  return (
    <section className="flex-1 min-h-0 w-full overflow-y-auto rounded-[17.76px] max-md:rounded-none max-md:border-none border border-white/[0.04] bg-[#090909] text-white shadow-2xl pb-[140px] md:pb-12">
      <div className="relative min-h-[330px] max-md:min-h-0 overflow-hidden border-b border-white/[0.05] px-7 pb-7 pt-5 max-md:px-4 max-md:pb-3 max-md:pt-2">
        <div className="absolute inset-0 opacity-45 blur-3xl">
          <img
            src={profileAvatar}
            alt=""
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/user.svg"; }}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/78 to-[#090909]" />

        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 max-md:mb-2 flex h-10 w-10 max-md:h-8 max-md:w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>

          <div className="flex items-end gap-7 max-md:flex-col max-md:items-center max-md:text-center max-md:gap-4">
            <img
              src={profileAvatar}
              alt={profile.name}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/user.svg"; }}
              className="h-52 w-52 max-md:h-36 max-md:w-36 shrink-0 rounded-full object-cover shadow-2xl"
            />
            <div className="max-w-4xl pb-2 max-md:flex max-md:flex-col max-md:items-center">
              <h1 className="text-5xl max-md:text-2xl font-black tracking-tight text-white max-md:text-center">{profile.username || profile.name}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-white/45 max-md:justify-center max-md:text-xs">
                <span>{formatCount(profile.trackCount || tracks.length)} треков</span>
                <span>{formatCount(profile.followers)} подписчиков</span>
                {profile.city && <span>{profile.city}</span>}
              </div>
              {profile.description && (
                <p className="mt-4 max-w-3xl line-clamp-2 text-sm max-md:text-xs font-semibold leading-relaxed text-white/45 max-md:text-center">
                  {profile.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2 max-md:justify-center max-md:w-full">
                <button type="button" onClick={() => sortedTracks[0] && handlePlayTrack(sortedTracks[0], sortedTracks)} disabled={!sortedTracks.length} className="rounded-full bg-white px-5 py-2.5 max-md:px-4 max-md:py-2 text-sm max-md:text-xs font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40">
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

      <div className="space-y-8 p-7 max-md:p-4">
        {error && <p className="text-sm font-semibold text-red-300">{error}</p>}
        {isLoading && !tracks.length && <p className="text-sm font-bold text-white/40">Загружаю артиста...</p>}

        {previewTracks.length > 0 && (
          <section className="mt-2">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className={latestRelease ? "lg:col-span-8 flex flex-col" : "lg:col-span-12 flex flex-col"}>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle onClick={() => setIsTracksViewOpen(true)}>Популярные треки</SectionTitle>
                  {previewTracks.length > 5 && (
                    <div className="flex md:hidden items-center gap-1.5 mb-4">
                      <button
                        type="button"
                        onClick={scrollPopLeft}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
                        aria-label="Назад"
                      >
                        <svg className="h-5 w-5 fill-current rotate-90" viewBox="0 0 24 24">
                          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={scrollPopRight}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
                        aria-label="Вперед"
                      >
                        <svg className="h-5 w-5 fill-current -rotate-90" viewBox="0 0 24 24">
                          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {(() => {
                  const leftTracks = [];
                  const rightTracks = [];
                  previewTracks.forEach((track, index) => {
                    if (index < 5) {
                      leftTracks.push({ track, originalIndex: index });
                    } else {
                      rightTracks.push({ track, originalIndex: index });
                    }
                  });

                  const renderTrackRowItem = ({ track, originalIndex }) => (
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

                  const popTrackChunks = [];
                  for (let i = 0; i < previewTracks.length; i += 5) {
                    popTrackChunks.push(
                      previewTracks.slice(i, i + 5).map((track, idx) => ({ track, originalIndex: i + idx }))
                    );
                  }

                  return (
                    <>
                      {/* Mobile View: horizontal page-by-page columns of 5 tracks */}
                      <div
                        ref={popularScrollRef}
                        className="flex md:hidden overflow-x-auto gap-3 snap-x snap-mandatory scrollbar-hide w-full pb-2"
                        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                        onWheel={(e) => {
                          if (e.deltaY !== 0) {
                            e.currentTarget.scrollBy({
                              left: e.deltaY > 0 ? 300 : -300,
                              behavior: 'smooth'
                            });
                          }
                        }}
                      >
                        {popTrackChunks.map((chunk, chunkIdx) => (
                          <div key={chunkIdx} className="w-full shrink-0 snap-start flex flex-col gap-1">
                            {chunk.map(renderTrackRowItem)}
                          </div>
                        ))}
                      </div>

                      {/* Desktop View: 2 column grid */}
                      <div className="hidden md:grid md:grid-cols-2 gap-1">
                        <div className="flex flex-col gap-1">
                          {leftTracks.map(renderTrackRowItem)}
                        </div>
                        <div className="flex flex-col gap-1">
                          {rightTracks.map(renderTrackRowItem)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {latestRelease && (
                <div className="lg:col-span-4 flex flex-col max-md:mt-6 max-md:items-center">
                  <h2 className="mb-4 text-2xl font-black text-white max-md:text-center">Новый релиз</h2>
                  <div className="flex-1 max-md:flex max-md:justify-center max-md:w-full">
                    <LatestReleaseCard
                      release={latestRelease}
                      artist={profile}
                      onOpen={openAlbum}
                      isSaved={savedReleaseIds.has(latestRelease.id)}
                      onToggleSave={toggleSavedRelease}
                    />
                  </div>
                </div>
              )}
            </div>
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
          <HorizontalScrollSection title="Альбомы">
            {fullAlbums.map((album) => (
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
            {singleReleases.map((single) => (
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
          <HorizontalScrollSection title="Плейлисты">
            {playlists.map((playlist) => (
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
