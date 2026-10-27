import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  DEFAULT_SPOTIFY_CLIENT_ID,
  DEFAULT_REDIRECT_URI,
  getSpotifyConfig,
  saveSpotifyConfig,
  getSpotifyAuth,
  clearSpotifyAuth,
  initiateSpotifyLogin,
  extractCodeFromUrl,
  handleSpotifyCallback,
  fetchCurrentUserProfile,
  fetchUserPlaylists,
  fetchPlaylistTracks,
  fetchUserSavedTracks,
  fetchPlaylistByUrl,
  transferSpotifyTracksBatch
} from "../services/spotifyApi";
import { openExternalUrl } from "../desktopApi";
import { useAudioPlayer } from "../audio/AudioPlayerContext";

export function SpotifyTransferModal({ isOpen, onClose, initialUrl = "" }) {
  const { createUserPlaylist, updateUserPlaylist, addTracksToLiked, showNotification } = useAudioPlayer();

  const [auth, setAuth] = useState(() => getSpotifyAuth());
  const [config, setConfig] = useState(() => getSpotifyConfig());
  const [showConfig, setShowConfig] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isWaitingBrowser, setIsWaitingBrowser] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState("playlists");
  const [playlists, setPlaylists] = useState([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(new Set());

  const [likedTotal, setLikedTotal] = useState(null);
  const [isLoadingLikedInfo, setIsLoadingLikedInfo] = useState(false);
  const [likedDestination, setLikedDestination] = useState("liked"); // "liked" | "playlist"

  const [urlInput, setUrlInput] = useState(initialUrl || "");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  const [transferState, setTransferState] = useState(null);
  const abortControllerRef = useRef(null);

  // Sync auth state on mount and events
  useEffect(() => {
    const handleAuthChange = (e) => {
      setAuth(e.detail || null);
    };
    window.addEventListener("amymusic:spotify-auth-changed", handleAuthChange);
    return () => window.removeEventListener("amymusic:spotify-auth-changed", handleAuthChange);
  }, []);

  // Listen for popup OAuth messages
  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.data?.type === "SPOTIFY_AUTH_CALLBACK" && event.data?.code) {
        setIsSubmittingCode(true);
        setLoginError("");
        try {
          const authData = await handleSpotifyCallback(event.data.code, event.data.state);
          setAuth(authData);
          showNotification("Успешная авторизация в Spotify!", "success");
        } catch (err) {
          setLoginError(err.message);
          showNotification(`Ошибка входа: ${err.message}`, "error");
        } finally {
          setIsSubmittingCode(false);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [showNotification]);

  // Load playlists and liked count when authenticated
  useEffect(() => {
    if (!isOpen || !auth?.accessToken) return;

    let isMounted = true;

    async function loadData() {
      setIsLoadingPlaylists(true);
      setIsLoadingLikedInfo(true);

      try {
        const pls = await fetchUserPlaylists();
        if (isMounted) {
          setPlaylists(pls);
        }
      } catch (err) {
        console.warn("Failed to load user playlists", err);
      } finally {
        if (isMounted) setIsLoadingPlaylists(false);
      }

      try {
        const sampleTracks = await fetchUserSavedTracks(1);
        if (isMounted) {
          setLikedTotal(sampleTracks.length > 0 ? "100+" : 0);
        }
      } catch (err) {
        console.warn("Failed to check saved tracks", err);
      } finally {
        if (isMounted) setIsLoadingLikedInfo(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, auth?.accessToken]);

  // Set initial URL if provided
  useEffect(() => {
    if (initialUrl) {
      setUrlInput(initialUrl);
      setActiveTab("byUrl");
    }
  }, [initialUrl]);

  // Handle deep link callback from desktop URL scheme
  useEffect(() => {
    const handleDeepLink = async (e) => {
      const rawUrl = e.detail;
      if (!rawUrl) return;
      console.log("[SpotifyModal] Deep link received:", rawUrl);
      const { code, state, error } = extractCodeFromUrl(rawUrl);
      if (error) {
        setLoginError(`Ошибка от Spotify: ${error}`);
        return;
      }
      if (code) {
        setIsSubmittingCode(true);
        setLoginError("");
        try {
          const authData = await handleSpotifyCallback(code, state);
          setAuth(authData);
          setIsWaitingBrowser(false);
          showNotification("Успешная авторизация в Spotify!", "success");
        } catch (err) {
          setLoginError(err.message);
          showNotification(`Ошибка: ${err.message}`, "error");
        } finally {
          setIsSubmittingCode(false);
        }
      }
    };

    window.addEventListener("amymusic:spotify-deeplink", handleDeepLink);
    return () => window.removeEventListener("amymusic:spotify-deeplink", handleDeepLink);
  }, [showNotification]);

  const handleStartLogin = async () => {
    setLoginError("");
    try {
      const authUrl = await initiateSpotifyLogin({
        clientId: config.clientId,
        redirectUri: config.redirectUri
      });

      // Always open in external system browser (Chrome/Edge/Firefox) - NEVER navigate this window!
      await openExternalUrl(authUrl);
      setIsWaitingBrowser(true);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleManualCodeSubmit = async (e) => {
    if (e) e.preventDefault();
    const raw = manualCodeInput.trim();
    if (!raw) return;

    const { code, state, error } = extractCodeFromUrl(raw);
    if (error) {
      setLoginError(`Ошибка от Spotify: ${error}`);
      return;
    }
    if (!code) {
      setLoginError("Не удалось извлечь код авторизации из введенного текста");
      return;
    }

    setIsSubmittingCode(true);
    setLoginError("");
    try {
      const authData = await handleSpotifyCallback(code, state);
      setAuth(authData);
      setManualCodeInput("");
      showNotification("Успешная авторизация в Spotify!", "success");
    } catch (err) {
      setLoginError(err.message);
      showNotification(`Ошибка: ${err.message}`, "error");
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleCopyUri = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(config.redirectUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  const handleLogout = () => {
    clearSpotifyAuth();
    setAuth(null);
    setPlaylists([]);
    setSelectedPlaylistIds(new Set());
    setLikedTotal(null);
    showNotification("Вы вышли из Spotify", "info");
  };

  const toggleSelectPlaylist = (id) => {
    setSelectedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPlaylistIds.size === filteredPlaylists.length) {
      setSelectedPlaylistIds(new Set());
    } else {
      setSelectedPlaylistIds(new Set(filteredPlaylists.map((p) => p.id)));
    }
  };

  const filteredPlaylists = useMemo(() => {
    if (!searchFilter.trim()) return playlists;
    const q = searchFilter.toLowerCase();
    return playlists.filter(
      (p) => p.title.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q)
    );
  }, [playlists, searchFilter]);

  // Cancel running transfer
  const handleCancelTransfer = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setTransferState((prev) => (prev ? { ...prev, status: "error", error: "Перенос отменён" } : null));
    }
  };

  // Transfer Single Playlist
  const transferSinglePlaylist = async (playlist) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTransferState({
      status: "fetching",
      title: playlist.title,
      currentTrack: "Загрузка треков из Spotify...",
      percent: 5,
      current: 0,
      total: playlist.trackCount || 0,
      matchedCount: 0,
      createdPlaylists: [],
      error: ""
    });

    try {
      const tracks = await fetchPlaylistTracks(playlist.id, (loaded, total) => {
        setTransferState((prev) =>
          prev
            ? {
                ...prev,
                currentTrack: `Загружено ${loaded} из ${total} треков Spotify...`,
                percent: Math.min(25, Math.round((loaded / total) * 25))
              }
            : null
        );
      });

      if (!tracks.length) {
        throw new Error("В этом плейлисте нет треков");
      }

      setTransferState((prev) =>
        prev
          ? {
              ...prev,
              status: "transferring",
              total: tracks.length,
              currentTrack: "Поиск и перенос треков в AmyMusic..."
            }
          : null
      );

      const transferred = await transferSpotifyTracksBatch(tracks, {
        signal: controller.signal,
        onProgress: ({ current, total, percent, currentTrack, matchedCount }) => {
          setTransferState((prev) =>
            prev
              ? {
                  ...prev,
                  current,
                  total,
                  percent: 25 + Math.round((percent / 100) * 70),
                  currentTrack,
                  matchedCount
                }
              : null
          );
        }
      });

      // Create playlist in AmyMusic
      const cover = playlist.cover || transferred[0]?.cover || "/logo.png";
      const created = createUserPlaylist(playlist.title, cover);
      if (created) {
        updateUserPlaylist(created.id, {
          tracks: transferred,
          trackCount: transferred.length,
          cover
        });
      }

      setTransferState({
        status: "success",
        title: playlist.title,
        currentTrack: "Готово!",
        percent: 100,
        current: transferred.length,
        total: tracks.length,
        matchedCount: transferred.filter((t) => t.source !== "spotify").length,
        createdPlaylists: [
          {
            id: created?.id,
            title: playlist.title,
            count: transferred.length,
            cover
          }
        ],
        error: ""
      });

      showNotification(`Плейлист "${playlist.title}" успешно перенесён!`, "success");
    } catch (err) {
      if (controller.signal.aborted) return;
      setTransferState((prev) =>
        prev ? { ...prev, status: "error", error: err.message || "Ошибка при переносе" } : null
      );
      showNotification(`Ошибка: ${err.message}`, "error");
    }
  };

  // Transfer Selected Playlists
  const transferSelectedPlaylists = async () => {
    const selected = playlists.filter((p) => selectedPlaylistIds.has(p.id));
    if (!selected.length) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const createdList = [];

    for (let i = 0; i < selected.length; i++) {
      if (controller.signal.aborted) break;
      const pl = selected[i];

      setTransferState({
        status: "transferring",
        title: `Плейлист ${i + 1} из ${selected.length}: ${pl.title}`,
        currentTrack: "Получение треков...",
        percent: Math.round((i / selected.length) * 100),
        current: 0,
        total: pl.trackCount || 0,
        matchedCount: 0,
        createdPlaylists: createdList,
        error: ""
      });

      try {
        const tracks = await fetchPlaylistTracks(pl.id);
        if (tracks.length) {
          const transferred = await transferSpotifyTracksBatch(tracks, {
            signal: controller.signal,
            onProgress: ({ current, total, currentTrack, matchedCount }) => {
              setTransferState((prev) =>
                prev
                  ? {
                      ...prev,
                      current,
                      total,
                      currentTrack: `[${i + 1}/${selected.length}] ${currentTrack}`,
                      matchedCount
                    }
                  : null
              );
            }
          });

          const cover = pl.cover || transferred[0]?.cover || "/logo.png";
          const created = createUserPlaylist(pl.title, cover);
          if (created) {
            updateUserPlaylist(created.id, {
              tracks: transferred,
              trackCount: transferred.length,
              cover
            });
            createdList.push({
              id: created.id,
              title: pl.title,
              count: transferred.length,
              cover
            });
          }
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        console.warn(`Failed to transfer ${pl.title}`, err);
      }
    }

    if (!controller.signal.aborted) {
      setTransferState({
        status: "success",
        title: "Перенос завершен!",
        currentTrack: `Успешно перенесено ${createdList.length} плейлистов`,
        percent: 100,
        current: createdList.length,
        total: selected.length,
        matchedCount: createdList.reduce((acc, p) => acc + p.count, 0),
        createdPlaylists: createdList,
        error: ""
      });
      setSelectedPlaylistIds(new Set());
      showNotification(`Успешно перенесено плейлистов: ${createdList.length}`, "success");
    }
  };

  // Transfer Liked Songs
  const transferLikedTracks = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTransferState({
      status: "fetching",
      title: "Любимые треки из Spotify",
      currentTrack: "Загрузка всех сохранённых треков...",
      percent: 10,
      current: 0,
      total: 0,
      matchedCount: 0,
      createdPlaylists: [],
      error: ""
    });

    try {
      const tracks = await fetchUserSavedTracks(0, (loaded, total) => {
        setTransferState((prev) =>
          prev
            ? {
                ...prev,
                currentTrack: `Загружено ${loaded} треков...`,
                total
              }
            : null
        );
      });

      if (!tracks.length) {
        throw new Error("У вас нет сохранённых треков в Spotify");
      }

      setTransferState((prev) =>
        prev
          ? {
              ...prev,
              status: "transferring",
              total: tracks.length,
              currentTrack: "Поиск в AmyMusic..."
            }
          : null
      );

      const transferred = await transferSpotifyTracksBatch(tracks, {
        signal: controller.signal,
        onProgress: ({ current, total, percent, currentTrack, matchedCount }) => {
          setTransferState((prev) =>
            prev
              ? {
                  ...prev,
                  current,
                  total,
                  percent: 20 + Math.round((percent / 100) * 75),
                  currentTrack,
                  matchedCount
                }
              : null
          );
        }
      });

      if (likedDestination === "liked") {
        addTracksToLiked(transferred);
        setTransferState({
          status: "success",
          title: "Любимые треки перенесены",
          currentTrack: `Добавлено ${transferred.length} треков в раздел "Мне нравится"`,
          percent: 100,
          current: transferred.length,
          total: tracks.length,
          matchedCount: transferred.filter((t) => t.source !== "spotify").length,
          createdPlaylists: [],
          error: ""
        });
      } else {
        const title = `Любимые треки из Spotify (${new Date().toLocaleDateString()})`;
        const cover = transferred[0]?.cover || "/logo.png";
        const created = createUserPlaylist(title, cover);
        if (created) {
          updateUserPlaylist(created.id, {
            tracks: transferred,
            trackCount: transferred.length,
            cover
          });
        }
        setTransferState({
          status: "success",
          title: "Плейлист создан",
          currentTrack: `Создан плейлист "${title}" с ${transferred.length} треками`,
          percent: 100,
          current: transferred.length,
          total: tracks.length,
          matchedCount: transferred.filter((t) => t.source !== "spotify").length,
          createdPlaylists: [
            {
              id: created?.id,
              title,
              count: transferred.length,
              cover
            }
          ],
          error: ""
        });
      }

      showNotification("Любимые треки из Spotify успешно перенесены!", "success");
    } catch (err) {
      if (controller.signal.aborted) return;
      setTransferState((prev) =>
        prev ? { ...prev, status: "error", error: err.message || "Ошибка переноса" } : null
      );
      showNotification(`Ошибка: ${err.message}`, "error");
    }
  };

  // Transfer by URL
  const transferByUrl = async () => {
    if (!urlInput.trim()) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoadingUrl(true);

    setTransferState({
      status: "fetching",
      title: "Загрузка плейлиста по ссылке",
      currentTrack: "Получение данных из Spotify...",
      percent: 10,
      current: 0,
      total: 0,
      matchedCount: 0,
      createdPlaylists: [],
      error: ""
    });

    try {
      const playlist = await fetchPlaylistByUrl(urlInput.trim());

      setTransferState((prev) =>
        prev
          ? {
              ...prev,
              status: "transferring",
              title: playlist.title,
              total: playlist.tracks.length,
              currentTrack: "Поиск и сопоставление треков..."
            }
          : null
      );

      const transferred = await transferSpotifyTracksBatch(playlist.tracks, {
        signal: controller.signal,
        onProgress: ({ current, total, percent, currentTrack, matchedCount }) => {
          setTransferState((prev) =>
            prev
              ? {
                  ...prev,
                  current,
                  total,
                  percent: 20 + Math.round((percent / 100) * 75),
                  currentTrack,
                  matchedCount
                }
              : null
          );
        }
      });

      const cover = playlist.cover || transferred[0]?.cover || "/logo.png";
      const created = createUserPlaylist(playlist.title, cover);
      if (created) {
        updateUserPlaylist(created.id, {
          tracks: transferred,
          trackCount: transferred.length,
          cover
        });
      }

      setTransferState({
        status: "success",
        title: playlist.title,
        currentTrack: `Успешно перенесено ${transferred.length} треков!`,
        percent: 100,
        current: transferred.length,
        total: playlist.tracks.length,
        matchedCount: transferred.filter((t) => t.source !== "spotify").length,
        createdPlaylists: [
          {
            id: created?.id,
            title: playlist.title,
            count: transferred.length,
            cover
          }
        ],
        error: ""
      });

      setUrlInput("");
      showNotification(`Плейлист "${playlist.title}" успешно перенесён!`, "success");
    } catch (err) {
      if (controller.signal.aborted) return;
      setTransferState((prev) =>
        prev ? { ...prev, status: "error", error: err.message || "Ошибка переноса по ссылке" } : null
      );
      showNotification(`Ошибка: ${err.message}`, "error");
    } finally {
      setIsLoadingUrl(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xl animate-[fadeIn_0.2s_ease-out]">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-2xl text-white">
        
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1DB954] via-[#8341EF] to-[#1DB954]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1DB954]/15 text-[#1DB954] shadow-inner">
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">Перенос из Spotify</h2>
                <span className="rounded-full bg-[#1DB954]/20 px-2 py-0.5 text-[11px] font-bold text-[#1DB954]">
                  OAuth
                </span>
              </div>
              <p className="text-xs text-white/40">Импорт плейлистов и треков напрямую в AmyMusic</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {auth?.user && (
              <div className="flex items-center gap-2.5 rounded-full bg-white/[0.04] py-1 pl-1 pr-3 border border-white/[0.06]">
                <img
                  src={auth.user.images?.[0]?.url || "/logo.png"}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="text-xs font-semibold text-white/80 max-w-[100px] truncate">
                  {auth.user.display_name || "Spotify User"}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-1 text-[11px] text-white/40 hover:text-red-400 transition"
                  title="Выйти из Spotify"
                >
                  Выйти
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white transition"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">

          {/* ACTIVE TRANSFER PROGRESS OVERLAY */}
          {transferState && (
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  {transferState.status === "success" ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                      ✓
                    </div>
                  ) : transferState.status === "error" ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                      ✕
                    </div>
                  ) : (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#1DB954] border-t-transparent" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">{transferState.title}</h4>
                    <p className="text-xs text-white/50">{transferState.currentTrack}</p>
                  </div>
                </div>

                {transferState.status === "transferring" && (
                  <button
                    type="button"
                    onClick={handleCancelTransfer}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/20 hover:text-white transition"
                  >
                    Отмена
                  </button>
                )}

                {transferState.status === "success" && (
                  <button
                    type="button"
                    onClick={() => setTransferState(null)}
                    className="rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#1ed760] transition"
                  >
                    Отлично
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-[#1DB954] to-[#8341EF] transition-all duration-300"
                  style={{ width: `${transferState.percent}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/40">
                <span>
                  Обработано: {transferState.current} из {transferState.total}
                </span>
                {transferState.matchedCount > 0 && (
                  <span className="text-[#1DB954]">
                    Найдено в SoundCloud: {transferState.matchedCount}
                  </span>
                )}
              </div>

              {transferState.error && (
                <p className="mt-2 text-xs font-medium text-red-400">{transferState.error}</p>
              )}
            </div>
          )}

          {/* VIEW 1: NOT LOGGED IN */}
          {!auth?.accessToken ? (
            <div className="flex flex-col items-center justify-center py-8 text-center max-w-lg mx-auto">
              <div className="relative mb-6">
                <div className="absolute -inset-4 rounded-full bg-[#1DB954]/20 blur-xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#1DB954] to-[#128a3c] shadow-2xl">
                  <svg className="h-11 w-11 fill-black" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                </div>
              </div>

              <h3 className="text-2xl font-black text-white">Войдите в свой Spotify</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed max-w-md">
                Авторизуйтесь через Spotify, чтобы просматривать свои плейлисты, любимые треки и переносить их в AmyMusic одним нажатием.
              </p>

              {loginError && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
                  {loginError}
                </div>
              )}

              <button
                type="button"
                onClick={handleStartLogin}
                className="mt-6 flex items-center gap-3 rounded-full bg-[#1DB954] px-8 py-3.5 text-sm font-black text-black shadow-lg shadow-[#1DB954]/25 transition hover:bg-[#1ed760] hover:scale-105 active:scale-95"
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Войти через Spotify (открыть в браузере)
              </button>

              {isWaitingBrowser && (
                <div className="mt-5 w-full max-w-md rounded-2xl border border-[#1DB954]/30 bg-[#1DB954]/10 p-4 text-left animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#1DB954] mb-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1DB954] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1DB954]"></span>
                    </span>
                    Страница входа открыта в вашем браузере
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    Войдите в аккаунт Spotify в браузере. После входа приложение подхватит авторизацию автоматически.
                  </p>
                </div>
              )}

              {/* Manual URL / Code paste box */}
              <div className="mt-8 w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left">
                <div className="text-xs font-bold text-white/70 mb-1.5">
                  Перенаправило на ссылку <span className="text-[#1DB954]">{config.redirectUri}</span>?
                </div>
                <p className="text-[11px] text-white/40 mb-3 leading-relaxed">
                  Если браузер не закрыл окно автоматически, просто скопируйте ссылку или код из адресной строки и вставьте сюда:
                </p>
                <form onSubmit={handleManualCodeSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={manualCodeInput}
                    onChange={(e) => setManualCodeInput(e.target.value)}
                    placeholder="amymusic://spotify-callback?code=..."
                    className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-[#1DB954]"
                  />
                  <button
                    type="submit"
                    disabled={!manualCodeInput.trim() || isSubmittingCode}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black hover:bg-white/80 disabled:opacity-40 transition"
                  >
                    {isSubmittingCode ? "..." : "Войти"}
                  </button>
                </form>
              </div>

              {/* Advanced Settings Toggle */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowConfig(!showConfig)}
                  className="text-xs text-white/40 hover:text-white/70 transition underline underline-offset-4"
                >
                  {showConfig ? "Скрыть настройки подключения" : "Настройки подключения (Client ID, Redirect URI)"}
                </button>

                {showConfig && (
                  <div className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-black/60 p-4 text-left animate-[fadeIn_0.2s_ease-out]">
                    <div className="mb-3">
                      <label className="text-[11px] font-bold text-white/60 uppercase">Spotify Client ID</label>
                      <input
                        type="text"
                        value={config.clientId}
                        onChange={(e) => {
                          const next = { ...config, clientId: e.target.value };
                          setConfig(next);
                          saveSpotifyConfig(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-[#1DB954]"
                      />
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-white/60 uppercase">Redirect URI</label>
                        <button
                          type="button"
                          onClick={handleCopyUri}
                          className="text-[10px] text-[#1DB954] hover:underline"
                        >
                          {copiedUri ? "Скопировано!" : "Скопировать"}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={config.redirectUri}
                        onChange={(e) => {
                          const next = { ...config, redirectUri: e.target.value };
                          setConfig(next);
                          saveSpotifyConfig(next);
                        }}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-[#1DB954]"
                      />
                      <p className="mt-1 text-[10px] text-white/30">
                        Убедитесь, что этот адрес добавлен в Redirect URIs в вашем Spotify Dashboard.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...config, redirectUri: "amymusic://spotify-callback" };
                          setConfig(next);
                          saveSpotifyConfig(next);
                        }}
                        className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10"
                      >
                        amymusic://
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...config, redirectUri: `${window.location.origin}/` };
                          setConfig(next);
                          saveSpotifyConfig(next);
                        }}
                        className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10"
                      >
                        {window.location.origin}/
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...config, redirectUri: "https://amymusic.app/" };
                          setConfig(next);
                          saveSpotifyConfig(next);
                        }}
                        className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10"
                      >
                        amymusic.app
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* VIEW 2: LOGGED IN — PLAYLISTS, LIKED, AND BY URL TABS */
            <div>
              {/* Tab Navigation */}
              <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3 mb-5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveTab("playlists")}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                    activeTab === "playlists"
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                  </svg>
                  Мои плейлисты ({playlists.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("liked")}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                    activeTab === "liked"
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-4 w-4 fill-current text-red-500" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  Любимые треки
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("byUrl")}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                    activeTab === "byUrl"
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-4 w-4 fill-none stroke-current" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  По ссылке Spotify
                </button>
              </div>

              {/* TAB 1: PLAYLISTS */}
              {activeTab === "playlists" && (
                <div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Поиск по плейлистам..."
                        className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#1DB954]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/5"
                      >
                        {selectedPlaylistIds.size === filteredPlaylists.length && filteredPlaylists.length > 0
                          ? "Снять выбор"
                          : "Выбрать все"}
                      </button>

                      {selectedPlaylistIds.size > 0 && (
                        <button
                          type="button"
                          onClick={transferSelectedPlaylists}
                          className="rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-black text-black hover:bg-[#1ed760] transition shadow-md shadow-[#1DB954]/20"
                        >
                          Перенести выбранные ({selectedPlaylistIds.size})
                        </button>
                      )}
                    </div>
                  </div>

                  {isLoadingPlaylists ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1DB954] border-t-transparent mb-3" />
                      <p className="text-xs text-white/40">Загрузка ваших плейлистов из Spotify...</p>
                    </div>
                  ) : filteredPlaylists.length === 0 ? (
                    <div className="py-12 text-center text-xs text-white/40">
                      Плейлисты не найдены
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                      {filteredPlaylists.map((pl) => {
                        const isSelected = selectedPlaylistIds.has(pl.id);
                        return (
                          <div
                            key={pl.id}
                            className={`group relative flex items-center gap-3.5 rounded-2xl border p-2.5 transition ${
                              isSelected
                                ? "border-[#1DB954]/50 bg-[#1DB954]/10"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                            }`}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectPlaylist(pl.id)}
                              className="h-4 w-4 rounded accent-[#1DB954] cursor-pointer ml-1"
                            />

                            {/* Cover */}
                            <img
                              src={pl.cover}
                              alt=""
                              className="h-13 w-13 rounded-xl object-cover bg-black/40 shrink-0"
                            />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-white truncate" title={pl.title}>
                                {pl.title}
                              </h4>
                              <p className="text-[11px] text-white/40 truncate">
                                {pl.trackCount} треков • {pl.owner}
                              </p>
                            </div>

                            {/* Transfer Single Button */}
                            <button
                              type="button"
                              onClick={() => transferSinglePlaylist(pl)}
                              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/80 hover:bg-[#1DB954] hover:text-black transition shrink-0"
                            >
                              Перенести
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LIKED TRACKS */}
              {activeTab === "liked" && (
                <div className="flex flex-col items-center justify-center py-8 text-center max-w-md mx-auto">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-pink-600 shadow-xl mb-4">
                    <svg className="h-8 w-8 fill-white" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-black text-white">Любимые треки из Spotify</h3>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed">
                    Перенесите всю вашу коллекцию понравившихся треков из Spotify в AmyMusic.
                  </p>

                  {/* Destination Option */}
                  <div className="mt-6 flex flex-col gap-2 w-full text-left">
                    <label
                      onClick={() => setLikedDestination("liked")}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                        likedDestination === "liked"
                          ? "border-[#1DB954] bg-[#1DB954]/10"
                          : "border-white/[0.06] bg-white/[0.02]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="liked_dest"
                        checked={likedDestination === "liked"}
                        onChange={() => setLikedDestination("liked")}
                        className="accent-[#1DB954]"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">Добавить в раздел «Мне нравится»</div>
                        <div className="text-[11px] text-white/40">Треки появятся в вашей основной коллекции лайков</div>
                      </div>
                    </label>

                    <label
                      onClick={() => setLikedDestination("playlist")}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                        likedDestination === "playlist"
                          ? "border-[#1DB954] bg-[#1DB954]/10"
                          : "border-white/[0.06] bg-white/[0.02]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="liked_dest"
                        checked={likedDestination === "playlist"}
                        onChange={() => setLikedDestination("playlist")}
                        className="accent-[#1DB954]"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">Создать отдельный плейлист</div>
                        <div className="text-[11px] text-white/40">«Любимые треки из Spotify» в ваших плейлистах</div>
                      </div>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={transferLikedTracks}
                    className="mt-6 flex items-center gap-2 rounded-full bg-[#1DB954] px-8 py-3 text-xs font-black text-black shadow-lg shadow-[#1DB954]/25 hover:bg-[#1ed760] transition"
                  >
                    Перенести любимые треки
                  </button>
                </div>
              )}

              {/* TAB 3: BY URL */}
              {activeTab === "byUrl" && (
                <div className="flex flex-col items-center justify-center py-8 text-center max-w-lg mx-auto">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-[#1DB954] mb-3">
                    <svg className="h-7 w-7 fill-none stroke-current" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-black text-white">Перенести по ссылке Spotify</h3>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed">
                    Вставьте ссылку на любой открытый плейлист Spotify (например, плейлист друга или редакторский чарт).
                  </p>

                  <div className="mt-6 flex w-full flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://open.spotify.com/playlist/..."
                      className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#1DB954]"
                    />
                    <button
                      type="button"
                      disabled={!urlInput.trim() || isLoadingUrl}
                      onClick={transferByUrl}
                      className="rounded-2xl bg-[#1DB954] px-6 py-3 text-xs font-black text-black hover:bg-[#1ed760] disabled:opacity-40 transition shrink-0"
                    >
                      {isLoadingUrl ? "Загрузка..." : "Импортировать"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
