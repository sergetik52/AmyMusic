import React, { useMemo, useState } from "react";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { getAlbumDetails, getTrackWaveTracks, hydrateSoundCloudTracks, searchTracks } from "../services/soundCloudApi";
import { useEscapeKey } from "../utils/useEscapeKey";
import { HorizontalScrollSection } from "./HorizontalScrollSection";
import { TrackMenuButton } from "./TrackContextMenu";

function HeartHeaderIcon() {
  return (
    <img
      src="/liked-cover.png"
      alt=""
      className="h-[66.68px] w-[66.68px] shrink-0 rounded-[6.9px] object-cover"
    />
  );
}

function LikeIcon() {
  return <img src="/like.svg" alt="" className="h-4 w-4 object-contain" />;
}

function TrackLikeButton({ track, isLiked, onToggleLike }) {
  return (
    <button
      type="button"
      onClick={() => onToggleLike?.(track.id, track)}
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
        className={`h-5 w-5 object-contain ${isLiked ? "" : "brightness-200"}`}
      />
    </button>
  );
}

function HoverPlayIcon() {
  return <img src="/play-hover.svg" alt="" className="h-7 w-7 object-contain drop-shadow" />;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function splitArtistNames(artist = "") {
  return String(artist || "Unknown artist")
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|;)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildArtistsFromLikes(tracks) {
  const artists = new Map();

  tracks.forEach((track) => {
    const trackArtists = getTrackArtists(track);

    trackArtists.forEach((artistInfo) => {
      const name = artistInfo.name || artistInfo.username;
      const current = artists.get(name) || {
        id: artistInfo.id || "",
        name,
        count: 0,
        avatar: artistInfo.avatar || track.artistAvatar || track.cover,
        permalinkUrl: artistInfo.permalinkUrl || "",
        tracks: []
      };

      artists.set(name, {
        ...current,
        id: current.id || artistInfo.id || "",
        count: current.count + 1,
        avatar: current.avatar || artistInfo.avatar || track.artistAvatar || track.cover,
        permalinkUrl: current.permalinkUrl || artistInfo.permalinkUrl || "",
        tracks: [...current.tracks, track]
      });
    });
  });

  return [...artists.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function getTrackArtists(track) {
  return track.artists?.length
    ? track.artists
    : [{
      id: track.artistId || "",
      name: track.artist,
      username: track.artist,
      avatar: track.artistAvatar || track.cover || "/logo.png",
      permalinkUrl: track.artistPermalinkUrl || ""
    }];
}

function TrackArtistLinks({ track, onOpenArtist }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-1 overflow-hidden text-xs font-medium text-white/40">
      {getTrackArtists(track).map((artist, index) => (
        <React.Fragment key={`${artist.id || artist.name}-${index}`}>
          {index > 0 && <span className="text-white/25">,</span>}
          <button
            type="button"
            onClick={() => onOpenArtist?.(artist, track)}
            className="max-w-[150px] truncate transition hover:text-white hover:underline"
          >
            {artist.name || artist.username}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function FavoriteArtistCard({ artist, index, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(artist)}
      className="group flex w-36 shrink-0 flex-col items-center rounded-2xl p-3 text-center transition hover:bg-white/[0.04]"
    >
      <div className="relative mb-3 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] shadow-2xl">
        <img src={artist.avatar} alt={artist.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-black/20 opacity-0 transition group-hover:opacity-100" />
        {index === 0 && (
          <img src="/korona.svg" alt="" className="absolute right-3 top-3 h-5 w-5 object-contain" />
        )}
      </div>
      <div className="w-full truncate text-sm font-black text-white">{artist.name}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-white/40">
        {artist.count} {artist.count === 1 ? "лайк" : "лайков"}
      </div>
    </button>
  );
}

function ReleaseCard({ release, onOpen, onUnlike }) {
  const tracks = release.tracks || [];

  return (
    <div className="group relative w-40 shrink-0 text-left">
      <button
        type="button"
        onClick={() => onOpen(release)}
        className="w-full text-left disabled:cursor-default disabled:opacity-60"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <img src={release.cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
          <div className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white/70">
            {tracks.length || release.trackCount || 0}
          </div>
        </div>
        <p className="mt-2 truncate text-sm font-black text-white">{release.title}</p>
        <p className="truncate text-xs font-semibold text-white/35">{release.artist}</p>
      </button>
      {onUnlike && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnlike(release);
          }}
          className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100 hover:bg-black/80 hover:scale-110"
        >
          <img src="/like.svg" alt="" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PlaylistView({
  playlist,
  isEditable,
  isLoading,
  likedTrackIds,
  onBack,
  onPlay,
  onOpenArtist,
  onToggleLike,
  onUpdate,
  onRemoveTrack,
  onDelete,
  onOpenTrackWave
}) {
  const [title, setTitle] = useState(playlist.title);
  const [cover, setCover] = useState(playlist.cover);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeletePromptOpen, setIsDeletePromptOpen] = useState(false);
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);
  const fileInputRef = React.useRef(null);
  const tracks = playlist.tracks || [];

  const saveChanges = () => {
    onUpdate?.(playlist.id, { title, cover });
  };

  const handleShufflePlay = () => {
    if (!tracks.length) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    onPlay(shuffled[0], shuffled);
  };

  const handleCoverFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setCover(dataUrl);
      onUpdate?.(playlist.id, { title, cover: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-1 select-none flex-col overflow-y-auto rounded-[17.76px] bg-[#090909] text-white">
      <div className="relative border-b border-white/[0.06] p-7">
        <div className="absolute inset-0 opacity-30 blur-3xl">
          <img src={cover || "/logo.png"} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/82 to-[#090909]" />
        
        {isCoverExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={() => setIsCoverExpanded(false)} />
            <img src={cover || "/logo.png"} alt="" className="relative z-10 max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
          </div>
        )}

        {isDeletePromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDeletePromptOpen(false)} />
            <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-[#121212] p-6 shadow-2xl">
              <h2 className="mb-2 text-xl font-black text-white">Удалить плейлист?</h2>
              <p className="mb-6 text-sm font-semibold text-white/50">Это действие нельзя будет отменить. Плейлист будет навсегда удален из вашей коллекции.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsDeletePromptOpen(false)}
                  className="flex-1 rounded-full bg-white/10 py-3 text-sm font-bold text-white transition hover:bg-white/20"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsDeletePromptOpen(false);
                    onDelete?.(playlist.id);
                  }}
                  className="flex-1 rounded-full bg-red-500 py-3 text-sm font-bold text-white transition hover:bg-red-600"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="relative z-10">
          <button 
            type="button" 
            onClick={onBack} 
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>
  
          <div className="flex items-end gap-6">
            <img 
              src={cover || "/logo.png"} 
              alt="" 
              onClick={() => setIsCoverExpanded(true)}
              className="h-48 w-48 rounded-3xl border border-white/10 object-cover shadow-2xl cursor-pointer transition hover:scale-105 active:scale-95" 
            />
            <div className="min-w-0 flex-1 pb-1">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/30">
                {isEditable ? "Мой плейлист" : playlist.kind === "album" ? "Альбом" : "Плейлист"}
              </p>
              {isEditable ? (
                <div className="max-w-xl space-y-2">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={saveChanges}
                    className="w-full bg-transparent text-5xl font-black tracking-tight text-white outline-none placeholder:text-white/20 transition hover:bg-white/[0.02] focus:bg-white/[0.04] rounded-lg px-2 -ml-2"
                  />
                </div>
              ) : (
                <h1 className="truncate text-5xl font-black tracking-tight text-white">{playlist.title}</h1>
              )}
              <p className="mt-2 text-sm font-bold text-white/38">
                {playlist.artist} · {tracks.length || playlist.trackCount || 0} треков
              </p>
              <div className="mt-6 flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => tracks[0] && onPlay(tracks[0], tracks)}
                  disabled={!tracks.length}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black transition hover:bg-white/85 disabled:cursor-default disabled:opacity-40"
                >
                  ▶ Слушать все
                </button>
                <button
                  type="button"
                  onClick={handleShufflePlay}
                  disabled={!tracks.length}
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-35"
                  aria-label="Перемешать плейлист и слушать"
                  title="Перемешать плейлист и слушать"
                >
                  <img src="/shuffle.svg" alt="" className="h-5 w-5 brightness-200 opacity-70" />
                </button>
                {isEditable && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] transition hover:bg-white/[0.07] active:scale-95"
                    >
                      <span className="text-white/60">•••</span>
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                        <div className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-2xl">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleCoverFileChange}
                            accept="image/*"
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              fileInputRef.current?.click();
                            }}
                            className="w-full border-b border-white/[0.06] px-4 py-3 text-left text-sm font-bold text-white/80 transition hover:bg-white/10"
                          >
                            Изменить обложку
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              setIsDeletePromptOpen(true);
                            }}
                            className="w-full px-4 py-3 text-left text-sm font-bold text-red-400 transition hover:bg-red-500/10"
                          >
                            Удалить плейлист
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1 p-7">
        {isLoading && (
          <p className="mb-4 text-sm font-bold text-white/35">Догружаю треки...</p>
        )}
        {tracks.length ? tracks.map((track, index) => (
          <div key={track.id} className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
            <button type="button" onClick={() => onPlay(track, tracks)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="w-7 text-right text-xs font-black text-white/25">{index + 1}</span>
              <img src={track.cover} alt="" className="h-11 w-11 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{track.title}</p>
                <TrackArtistLinks track={track} onOpenArtist={onOpenArtist} />
              </div>
              <span className="text-xs font-semibold text-white/30">{formatDuration(track.duration)}</span>
            </button>
            <TrackLikeButton
              track={track}
              isLiked={likedTrackIds.has(track.id)}
              onToggleLike={onToggleLike}
            />
            <button
              type="button"
              title="Волна по треку"
              onClick={() => onOpenTrackWave?.(track)}
              className="rounded-full px-2 py-1 text-xs font-bold text-[#8341EF]/60 transition hover:bg-[#8341EF]/10 hover:text-[#8341EF] opacity-0 group-hover:opacity-100"
              aria-label="Волна по треку"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            </button>
            {isEditable && (
              <button
                type="button"
                onClick={() => onRemoveTrack?.(playlist.id, track.id)}
                className="rounded-full px-3 py-1 text-xs font-bold text-white/35 transition hover:bg-white/[0.06] hover:text-white"
              >
                Удалить
              </button>
            )}
          </div>
        )) : (
          <div className="grid min-h-[220px] place-items-center text-sm font-bold text-white/35">
            Плейлист пустой
          </div>
        )}
      </div>
    </div>
  );
}

export function CollectionView({ onOpenArtist }) {
  const {
    currentTrack,
    isPlaying,
    likedTrackIds,
    likedTracks,
    dislikedTrackIds,
    dislikedTracks,
    savedReleases,
    userPlaylists,
    addTrackToUserPlaylist,
    createUserPlaylist,
    updateUserPlaylist,
    removeTrackFromUserPlaylist,
    deleteUserPlaylist,
    createPlaylist,
    playTrack,
    toggleLike,
    toggleSavedRelease
  } = useAudioPlayer();
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistCover, setPlaylistCover] = useState("");
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [isAddPlaylistOpen, setIsAddPlaylistOpen] = useState(false);
  const [trackWaveLoading, setTrackWaveLoading] = useState(false);
  const fileInputRef = React.useRef(null);

  const openTrackWave = async (track) => {
    if (trackWaveLoading) return;
    setTrackWaveLoading(true);
    try {
      const waveTracks = await getTrackWaveTracks(track, {
        likedTracks,
        dislikedTrackIds,
        dislikedTracks
      });
      if (waveTracks.length) {
        const seed = { ...track };
        await playTrack(seed, [seed, ...waveTracks]);
      }
    } catch (e) {
      // silently fail
    } finally {
      setTrackWaveLoading(false);
    }
  };

  const handlePlaylistCoverChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setPlaylistCover(result);
      }
    };
    reader.readAsDataURL(file);
  };
  
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  const favoriteArtists = useMemo(
    () => buildArtistsFromLikes(likedTracks),
    [likedTracks]
  );
  const savedAlbums = useMemo(
    () => savedReleases.filter((release) => release.kind === "album"),
    [savedReleases]
  );
  const savedPlaylists = useMemo(
    () => savedReleases.filter((release) => release.kind === "playlist"),
    [savedReleases]
  );
  const handleCreatePlaylist = (event) => {
    event.preventDefault();
    const created = createUserPlaylist(playlistTitle, playlistCover);
    if (created) {
      setPlaylistTitle("");
      setPlaylistCover("");
    }
  };

  const handleImportPlaylist = async (event) => {
    event.preventDefault();
    if (!importUrl || isImporting) return;
    
    setIsImporting(true);
    setImportStatus("Парсинг страницы...");
    try {
      if (!window.amyMusicDesktop?.parsePlaylist) {
        throw new Error("Функция импорта недоступна");
      }
      
      const parsedTracks = await window.amyMusicDesktop.parsePlaylist(importUrl);
      if (!parsedTracks || parsedTracks.length === 0) {
        throw new Error("Не найдено треков на странице");
      }
      
      setImportStatus(`Поиск треков: 0 / ${parsedTracks.length}`);
      
      const foundTracks = [];
      let i = 0;
      for (const t of parsedTracks) {
        i++;
        setImportStatus(`Поиск треков: ${i} / ${parsedTracks.length}`);
        
        const queriesToTry = [];
        
        // 1. Full artist + title
        if (t.artist && t.title) {
          queriesToTry.push(`${t.artist} ${t.title}`.trim());
          
          // 2. Main artist + title (if multiple artists)
          const mainArtist = t.artist.split(',')[0].trim();
          if (mainArtist !== t.artist) {
            queriesToTry.push(`${mainArtist} ${t.title}`.trim());
          }
        }
        
        // 3. Just title
        if (t.title) {
          queriesToTry.push(t.title);
          
          // 4. Clean title (without brackets)
          const cleanTitle = t.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
          if (cleanTitle && cleanTitle !== t.title) {
            queriesToTry.push(cleanTitle);
            if (t.artist) queriesToTry.push(`${t.artist} ${cleanTitle}`.trim());
          }
        }
        
        let found = false;
        
        for (const query of queriesToTry) {
          if (!query || found) continue;
          try {
            const results = await searchTracks(query);
            if (results && results.length > 0) {
              foundTracks.push(results[0]);
              found = true;
            }
          } catch (e) {
            console.warn("Search failed for query", query, e);
          }
        }
      }
      
      if (foundTracks.length > 0) {
        const title = "Импортированный плейлист";
        const createdPlaylist = createUserPlaylist(title);
        if (createdPlaylist) {
          updateUserPlaylist(createdPlaylist.id, { 
            tracks: foundTracks, 
            trackCount: foundTracks.length,
            cover: foundTracks[0]?.cover || "/logo.png"
          });
        }
      } else {
        throw new Error("Не удалось найти треки в SoundCloud");
      }
    } catch (err) {
      alert("Ошибка импорта: " + err.message);
    } finally {
      setIsImporting(false);
      setImportStatus("");
      setImportUrl("");
    }
  };

  const openPlaylist = async (playlist) => {
    setActivePlaylist(playlist);
    setIsPlaylistLoading(true);
    try {
      if (playlist.kind === "user-playlist" || playlist.kind === "liked-tracks") {
        // Hydrate soundcloud tracks if needed
        const hydratedTracks = await hydrateSoundCloudTracks(playlist.tracks);
        if (hydratedTracks.some((t) => t.isHydrated)) {
          if (playlist.kind === "user-playlist") updateUserPlaylist(playlist.id, { tracks: hydratedTracks });
        }
      } else {
        const fullAlbum = await getAlbumDetails(playlist, {
          username: playlist.artist,
          name: playlist.artist,
          avatar: playlist.cover
        });
        setActivePlaylist(fullAlbum);
      }
    } finally {
      setIsPlaylistLoading(false);
    }
  };

  const openLikedTracks = () => {
    setActivePlaylist({
      id: "liked-tracks",
      kind: "liked-tracks",
      title: "Мне нравится",
      cover: "/liked-cover.png",
      artist: "Мои любимые треки",
      tracks: likedTracks
    });
  };

  const activeUserPlaylist = activePlaylist?.kind === "user-playlist"
    ? userPlaylists.find((playlist) => playlist.id === activePlaylist.id)
    : null;
  const activeSavedRelease = activePlaylist?.kind !== "user-playlist"
    ? savedReleases.find((release) => release.id === activePlaylist?.id)
    : null;
  const resolvedActivePlaylist = activePlaylist?.kind === "user-playlist"
    ? activeUserPlaylist || activePlaylist
    : activePlaylist || activeSavedRelease;

  useEscapeKey(Boolean(resolvedActivePlaylist), () => setActivePlaylist(null));

  const openTrackArtist = (artist, track) => {
    const selectedArtist = artist || {
      id: track.artistId || "",
      name: track.artist,
      username: track.artist,
      avatar: track.artistAvatar || track.cover || "/logo.png",
      permalinkUrl: track.artistPermalinkUrl || ""
    };
    if (!selectedArtist.id && !selectedArtist.name && !selectedArtist.username) return;
    onOpenArtist?.({
      id: selectedArtist.id || "",
      name: selectedArtist.name || selectedArtist.username,
      username: selectedArtist.username || selectedArtist.name,
      avatar: selectedArtist.avatar || track.artistAvatar || track.cover || "/logo.png",
      permalinkUrl: selectedArtist.permalinkUrl || "",
      followers: 0,
      followings: 0,
      trackCount: 0,
      city: "",
      country: "",
      tags: []
    });
  };

  const openFavoriteArtist = (artist) => {
    const firstTrack = artist.tracks[0];
    onOpenArtist?.({
      id: artist.id || artist.name,
      name: artist.name,
      username: artist.name,
      avatar: artist.avatar || firstTrack?.artistAvatar || firstTrack?.cover || "/logo.png",
      permalinkUrl: artist.permalinkUrl || "",
      followers: 0,
      followings: 0,
      trackCount: artist.tracks.length,
      city: "",
      country: "",
      tags: []
    });
  };

  if (resolvedActivePlaylist) {
    return (
      <PlaylistView
        playlist={resolvedActivePlaylist}
        isEditable={resolvedActivePlaylist.kind === "user-playlist"}
        isLoading={isPlaylistLoading}
        likedTrackIds={likedTrackIds}
        onBack={() => setActivePlaylist(null)}
        onPlay={playTrack}
        onOpenArtist={openTrackArtist}
        onToggleLike={toggleLike}
        onUpdate={updateUserPlaylist}
        onRemoveTrack={removeTrackFromUserPlaylist}
        onOpenTrackWave={openTrackWave}
        onDelete={(playlistId) => {
          deleteUserPlaylist(playlistId);
          setActivePlaylist(null);
        }}
      />
    );
  }

  if (isAddPlaylistOpen) {
    return (
      <div className="flex flex-1 select-none flex-col overflow-y-auto rounded-[17.76px] bg-[#090909] text-white animate-[slideUpFade_0.2s_ease-out_forwards]">
        <div className="relative border-b border-white/[0.06] p-7 min-h-[315px]">
          <div className="absolute inset-0 opacity-30 blur-3xl">
            <img src={playlistCover || "/logo.png"} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#090909]/82 to-[#090909]" />
          
          <div className="relative z-10 flex flex-col h-full">
            <button 
              type="button" 
              onClick={() => setIsAddPlaylistOpen(false)}
              className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95" 
              aria-label="Назад"
            >
              <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
            </button>

            <div className="flex items-end gap-7">
              <div 
                className="group relative flex h-56 w-56 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl transition hover:border-white/20"
                onClick={() => fileInputRef.current?.click()}
              >
                {playlistCover ? (
                  <img src={playlistCover} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-6xl font-light text-white/20 transition group-hover:text-white/40 group-hover:scale-110">+</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-sm font-bold text-white">Обложка</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handlePlaylistCoverChange}
                />
              </div>

              <div className="flex flex-1 flex-col pb-2 max-w-4xl">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-white/35">Создать плейлист</p>
                
                <form
                  onSubmit={(e) => {
                    handleCreatePlaylist(e);
                    setIsAddPlaylistOpen(false);
                  }}
                  className="flex flex-col items-start gap-4"
                >
                  <input
                    type="text"
                    value={playlistTitle}
                    onChange={(event) => setPlaylistTitle(event.target.value)}
                    placeholder="Название нового плейлиста"
                    className="w-full bg-transparent text-5xl font-black tracking-tight text-white placeholder:text-white/20 outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!playlistTitle.trim()}
                    className="mt-3 rounded-full bg-white px-8 py-3 text-sm font-black text-black transition hover:bg-white/85 disabled:opacity-50"
                  >
                    Создать плейлист
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <div className="p-7">
          <div className="max-w-4xl">
            <h3 className="mb-3 text-sm font-bold text-white/40">Или импортировать по ссылке</h3>
            <form
              onSubmit={(e) => {
                handleImportPlaylist(e);
                setIsAddPlaylistOpen(false);
              }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 max-w-2xl"
            >
              <input
                type="text"
                value={isImporting ? importStatus : importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                disabled={isImporting}
                placeholder={isImporting ? importStatus : "Ссылка на плейлист..."}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-white placeholder:text-white/28 outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isImporting || !importUrl}
                className="rounded-full bg-[#8341EF] px-5 py-2 text-xs font-black text-white transition hover:bg-[#9254f6] disabled:opacity-50"
              >
                Импортировать
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 select-none flex-col overflow-y-auto rounded-[17.76px] bg-[#0d0d0d] p-8 text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Коллекция</h1>
        <p className="mt-1 text-sm font-medium text-white/40">
          Реальные лайки из текущего плеера
        </p>
      </div>

      <div className="mb-10">
        <div className="mb-4 flex items-center gap-3.5">
          <HeartHeaderIcon />

          <div className="flex flex-col justify-center">
            <button type="button" onClick={openLikedTracks} className="flex items-center gap-1.5 text-2xl font-black hover:opacity-80 transition text-left">
              <span>Мне нравится</span>
              <span className="text-xl text-white/40">›</span>
            </button>

            <span className="mt-0.5 text-xs font-semibold text-white/40">
              {likedTracks.length} {likedTracks.length === 1 ? "трек" : "треков"}
            </span>
          </div>
        </div>

        {likedTracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
            <p className="text-sm font-semibold text-white/70">Пока нет лайкнутых треков</p>
            <p className="mt-1 text-xs text-white/35">
              Поставь лайк в нижнем плеере, поиске или в Моей волне.
            </p>
          </div>
        ) : (
          (() => {
            const visibleSlice = likedTracks.slice(0, 10);
            const leftTracks = [];
            const rightTracks = [];
            visibleSlice.forEach((track, index) => {
              const chunkIndex = Math.floor(index / 5);
              if (chunkIndex % 2 === 0) {
                leftTracks.push(track);
              } else {
                rightTracks.push(track);
              }
            });

            const renderTrackItem = (track) => {
              const isCurrent = currentTrack.id === track.id;
              return (
                <div
                  key={track.id}
                  className="group flex items-center justify-between rounded-xl p-2 transition hover:bg-white/5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
                    <button
                      type="button"
                      onClick={() => playTrack(track, likedTracks)}
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10"
                      aria-label={`Включить ${track.title}`}
                    >
                      <img src={track.cover} alt="" className="h-full w-full object-cover" />
                      <div
                        className={[
                          "absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity",
                          isCurrent && isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        ].join(" ")}
                      >
                        <HoverPlayIcon />
                      </div>
                    </button>

                    <div className="flex min-w-0 flex-col">
                      <button
                        type="button"
                        onClick={() => playTrack(track, likedTracks)}
                        className="truncate text-left text-sm font-semibold text-white transition hover:text-white/80"
                      >
                        {track.title}
                      </button>
                      <TrackArtistLinks track={track} onOpenArtist={openTrackArtist} />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 pl-2">
                    <button
                      type="button"
                      onClick={() => openTrackWave(track)}
                      disabled={trackWaveLoading}
                      title="Волна по треку"
                      className="opacity-0 group-hover:opacity-100 text-[#8341EF]/60 transition hover:text-[#8341EF] disabled:opacity-30 px-1"
                      aria-label="Волна по треку"
                    >
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3zm0 16a7 7 0 1 1 0-14A7 7 0 0 1 12 19zm-1-7.59V8h2v3.41l2.29 2.3-1.41 1.41L11 12.41z"/></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLike(track.id, track)}
                      className="opacity-80 transition hover:opacity-100"
                      aria-label="Убрать лайк"
                    >
                      <LikeIcon />
                    </button>
                    <div className="relative w-10 h-10 flex items-center justify-end shrink-0">
                      <span className="text-xs font-medium text-white/40 group-hover:opacity-0 transition-opacity duration-150">
                        {formatDuration(track.duration)}
                      </span>
                      <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <TrackMenuButton
                          track={track}
                          onOpenArtist={onOpenArtist}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-2">
                <div className="flex flex-col gap-y-2">
                  {leftTracks.map(renderTrackItem)}
                </div>
                <div className="flex flex-col gap-y-2">
                  {rightTracks.map(renderTrackItem)}
                </div>
              </div>
            );
          })()
        )}
      </div>

        <div className="mb-10 space-y-8">
          {savedAlbums.length > 0 && (
            <HorizontalScrollSection title="Альбомы">
              {savedAlbums.map((release) => (
                <ReleaseCard key={release.id} release={release} onOpen={openPlaylist} onUnlike={toggleSavedRelease} />
              ))}
            </HorizontalScrollSection>
          )}

          {savedPlaylists.length > 0 && (
            <HorizontalScrollSection title="Плейлисты">
              {savedPlaylists.map((release) => (
                <ReleaseCard key={release.id} release={release} onOpen={openPlaylist} onUnlike={toggleSavedRelease} />
              ))}
            </HorizontalScrollSection>
          )}

          <HorizontalScrollSection title="Мои плейлисты">
            <button
              type="button"
              onClick={() => setIsAddPlaylistOpen(true)}
              className="group relative w-40 shrink-0 text-left"
            >
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition duration-300 group-hover:bg-white/[0.08]">
                <span className="text-5xl font-light text-white/30 transition duration-300 group-hover:scale-110 group-hover:text-white/60">+</span>
              </div>
              <p className="mt-2 truncate text-sm font-black text-white transition group-hover:text-white/80">Добавить</p>
              <p className="truncate text-xs font-semibold text-white/35">Создать или импорт</p>
            </button>
            {userPlaylists.map((playlist) => (
              <ReleaseCard key={playlist.id} release={playlist} onOpen={openPlaylist} />
            ))}
          </HorizontalScrollSection>
        </div>



      {favoriteArtists.length > 0 && (
        <HorizontalScrollSection title="Любимые исполнители">
          {favoriteArtists.map((artist, index) => (
            <FavoriteArtistCard
              key={artist.name}
              artist={artist}
              index={index}
              onOpen={openFavoriteArtist}
            />
          ))}
        </HorizontalScrollSection>
      )}
    </div>
  );
}
