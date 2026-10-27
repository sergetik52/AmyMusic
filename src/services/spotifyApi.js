/**
 * Spotify API Service for AmyMusic
 * Implements Spotify OAuth 2.0 with PKCE (Proof Key for Code Exchange),
 * API fetching for playlists and saved tracks, and track matching into AmyMusic.
 */

import { searchTracks } from "./soundCloudApi";

export const DEFAULT_SPOTIFY_CLIENT_ID = "0c0053dd5bfd401f9a5b064273513e5e";
export const DEFAULT_REDIRECT_URI = "amymusic://spotify-callback";
export const SPOTIFY_AUTH_STORAGE_KEY = "amymusic.spotifyAuth.v1";
export const SPOTIFY_CONFIG_STORAGE_KEY = "amymusic.spotifyConfig.v1";

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read"
].join(" ");

// ---------------- PKCE Helpers ----------------

export function generateRandomString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).map((x) => possible[x % possible.length]).join("");
}

export async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------- Storage & Config ----------------

export function getSpotifyConfig() {
  if (typeof window === "undefined") {
    return { clientId: DEFAULT_SPOTIFY_CLIENT_ID, redirectUri: DEFAULT_REDIRECT_URI };
  }
  try {
    const saved = localStorage.getItem(SPOTIFY_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        clientId: parsed.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
        redirectUri: parsed.redirectUri || DEFAULT_REDIRECT_URI
      };
    }
  } catch (e) {}
  return { clientId: DEFAULT_SPOTIFY_CLIENT_ID, redirectUri: DEFAULT_REDIRECT_URI };
}

export function saveSpotifyConfig(config) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      SPOTIFY_CONFIG_STORAGE_KEY,
      JSON.stringify({
        clientId: config.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
        redirectUri: config.redirectUri || DEFAULT_REDIRECT_URI
      })
    );
  } catch (e) {}
}

export function getSpotifyAuth() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SPOTIFY_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveSpotifyAuth(authData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SPOTIFY_AUTH_STORAGE_KEY, JSON.stringify(authData));
    window.dispatchEvent(new CustomEvent("amymusic:spotify-auth-changed", { detail: authData }));
  } catch (e) {}
}

export function clearSpotifyAuth() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SPOTIFY_AUTH_STORAGE_KEY);
    sessionStorage.removeItem("spotify_pkce_verifier");
    sessionStorage.removeItem("spotify_auth_state");
    sessionStorage.removeItem("spotify_redirect_uri");
    window.dispatchEvent(new CustomEvent("amymusic:spotify-auth-changed", { detail: null }));
  } catch (e) {}
}

// ---------------- Authorization Flow ----------------

export async function initiateSpotifyLogin({
  clientId = getSpotifyConfig().clientId,
  redirectUri = getSpotifyConfig().redirectUri
} = {}) {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomString(16);

  if (typeof window !== "undefined") {
    sessionStorage.setItem("spotify_pkce_verifier", verifier);
    sessionStorage.setItem("spotify_auth_state", state);
    sessionStorage.setItem("spotify_redirect_uri", redirectUri);
    saveSpotifyConfig({ clientId, redirectUri });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri,
    state
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function extractCodeFromUrl(urlOrCode = "") {
  const raw = String(urlOrCode || "").trim();
  if (!raw) return { code: "", state: "" };

  if (!raw.includes("?") && !raw.includes("&") && !raw.includes("code=")) {
    return { code: raw, state: "" };
  }

  try {
    let searchPart = "";
    if (raw.includes("?")) {
      searchPart = raw.split("?")[1];
    } else if (raw.includes("#")) {
      searchPart = raw.split("#")[1];
    } else {
      searchPart = raw;
    }
    const params = new URLSearchParams(searchPart);
    return {
      code: params.get("code") || "",
      state: params.get("state") || "",
      error: params.get("error") || ""
    };
  } catch (e) {
    return { code: "", state: "" };
  }
}

export async function handleSpotifyCallback(code, state = "", options = {}) {
  if (!code) throw new Error("Код авторизации не найден");

  const storedVerifier = typeof window !== "undefined" ? sessionStorage.getItem("spotify_pkce_verifier") : "";
  const storedUri = typeof window !== "undefined" ? sessionStorage.getItem("spotify_redirect_uri") : "";
  const config = getSpotifyConfig();

  const verifier = options.verifier || storedVerifier || "";
  const redirectUri = options.redirectUri || storedUri || config.redirectUri || DEFAULT_REDIRECT_URI;
  const clientId = options.clientId || config.clientId || DEFAULT_SPOTIFY_CLIENT_ID;

  if (!verifier) {
    throw new Error("Не найден PKCE code_verifier. Пожалуйста, начните авторизацию заново.");
  }

  const tokenUrl = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ошибка получения токена Spotify (${response.status}): ${errorText}`);
  }

  const tokenData = await response.json();
  const expiresAt = Date.now() + (Number(tokenData.expires_in) || 3600) * 1000;

  const authPayload = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    clientId,
    redirectUri,
    user: null
  };

  saveSpotifyAuth(authPayload);

  // Fetch current user info
  try {
    const userProfile = await fetchCurrentUserProfile(tokenData.access_token);
    authPayload.user = userProfile;
    saveSpotifyAuth(authPayload);
  } catch (e) {
    console.warn("Failed to fetch Spotify user profile", e);
  }

  return authPayload;
}

export async function refreshSpotifyToken() {
  const auth = getSpotifyAuth();
  if (!auth || !auth.refreshToken) {
    throw new Error("Отсутствует refresh token для Spotify");
  }

  const tokenUrl = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    client_id: auth.clientId || DEFAULT_SPOTIFY_CLIENT_ID
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    clearSpotifyAuth();
    throw new Error("Не удалось обновить сессию Spotify. Войдите заново.");
  }

  const data = await response.json();
  const updatedAuth = {
    ...auth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
  };

  saveSpotifyAuth(updatedAuth);
  return updatedAuth.accessToken;
}

export async function getValidSpotifyAccessToken() {
  const auth = getSpotifyAuth();
  if (!auth || !auth.accessToken) {
    return null;
  }

  // If token is about to expire within 60 seconds, refresh it
  if (Date.now() >= (auth.expiresAt || 0) - 60000) {
    try {
      return await refreshSpotifyToken();
    } catch (e) {
      console.warn("Failed to auto-refresh Spotify token", e);
      return null;
    }
  }

  return auth.accessToken;
}

// ---------------- Spotify API Client ----------------

export async function fetchSpotifyApi(endpoint, options = {}) {
  let token = await getValidSpotifyAccessToken();
  if (!token && options.token) {
    token = options.token;
  }
  if (!token) {
    throw new Error("Необходима авторизация в Spotify");
  }

  const url = endpoint.startsWith("http") ? endpoint : `https://api.spotify.com/v1${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401 && !options._retried) {
    try {
      token = await refreshSpotifyToken();
      return await fetchSpotifyApi(endpoint, { ...options, _retried: true, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    } catch (e) {
      clearSpotifyAuth();
      throw new Error("Сессия Spotify истекла. Авторизуйтесь снова.");
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ошибка (${res.status}): ${text}`);
  }

  return await res.json();
}

// ---------------- Data Fetching ----------------

export async function fetchCurrentUserProfile(explicitToken) {
  return await fetchSpotifyApi("/me", explicitToken ? { token: explicitToken } : {});
}

export async function fetchUserPlaylists(limit = 50) {
  let items = [];
  let nextUrl = `/me/playlists?limit=${Math.min(limit, 50)}&offset=0`;

  while (nextUrl) {
    const res = await fetchSpotifyApi(nextUrl);
    if (res.items && Array.isArray(res.items)) {
      items = [...items, ...res.items];
    }
    nextUrl = res.next || null;
  }

  return items.map((pl) => ({
    id: pl.id,
    title: pl.name || "Untitled Playlist",
    description: pl.description || "",
    cover: pl.images?.[0]?.url || "/logo.png",
    trackCount: pl.tracks?.total || 0,
    owner: pl.owner?.display_name || "Spotify",
    isPublic: Boolean(pl.public),
    collaborative: Boolean(pl.collaborative),
    url: pl.external_urls?.spotify || ""
  }));
}

export async function fetchPlaylistTracks(playlistId, onProgress) {
  if (!playlistId) return [];

  let tracks = [];
  let nextUrl = `/playlists/${playlistId}/tracks?limit=100&offset=0`;
  let total = null;

  while (nextUrl) {
    const res = await fetchSpotifyApi(nextUrl);
    if (total === null && typeof res.total === "number") {
      total = res.total;
    }

    if (res.items && Array.isArray(res.items)) {
      for (const item of res.items) {
        if (!item || !item.track) continue;
        const t = item.track;
        tracks.push({
          id: t.id || `spotify-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          title: t.name || "Без названия",
          artist: t.artists?.map((a) => a.name).join(", ") || "Unknown artist",
          artists: t.artists?.map((a) => a.name) || [],
          album: t.album?.name || "",
          cover: t.album?.images?.[0]?.url || "/logo.png",
          duration: Math.round((t.duration_ms || 0) / 1000),
          spotifyId: t.id,
          spotifyUrl: t.external_urls?.spotify || "",
          isrc: t.external_ids?.isrc || ""
        });
      }
    }

    if (onProgress && total) {
      onProgress(tracks.length, total);
    }

    nextUrl = res.next || null;
  }

  return tracks;
}

export async function fetchUserSavedTracks(limit = 0, onProgress) {
  let tracks = [];
  let nextUrl = `/me/tracks?limit=50&offset=0`;
  let total = null;

  while (nextUrl) {
    const res = await fetchSpotifyApi(nextUrl);
    if (total === null && typeof res.total === "number") {
      total = res.total;
    }

    if (res.items && Array.isArray(res.items)) {
      for (const item of res.items) {
        if (!item || !item.track) continue;
        const t = item.track;
        tracks.push({
          id: t.id || `spotify-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          title: t.name || "Без названия",
          artist: t.artists?.map((a) => a.name).join(", ") || "Unknown artist",
          artists: t.artists?.map((a) => a.name) || [],
          album: t.album?.name || "",
          cover: t.album?.images?.[0]?.url || "/logo.png",
          duration: Math.round((t.duration_ms || 0) / 1000),
          spotifyId: t.id,
          spotifyUrl: t.external_urls?.spotify || "",
          isrc: t.external_ids?.isrc || ""
        });
      }
    }

    if (onProgress && total) {
      onProgress(tracks.length, total);
    }

    if (limit > 0 && tracks.length >= limit) {
      tracks = tracks.slice(0, limit);
      break;
    }

    nextUrl = res.next || null;
  }

  return tracks;
}

export async function fetchPlaylistByUrl(urlOrId) {
  let playlistId = urlOrId.trim();
  const match = playlistId.match(/playlist\/([a-zA-Z0-9]+)/i);
  if (match) {
    playlistId = match[1];
  } else if (playlistId.startsWith("spotify:playlist:")) {
    playlistId = playlistId.split(":")[2];
  }

  const playlistData = await fetchSpotifyApi(`/playlists/${playlistId}`);
  const tracks = await fetchPlaylistTracks(playlistId);

  return {
    id: playlistData.id,
    title: playlistData.name || "Импортированный плейлист",
    description: playlistData.description || "",
    cover: playlistData.images?.[0]?.url || tracks[0]?.cover || "/logo.png",
    trackCount: tracks.length,
    tracks
  };
}

// ---------------- Track Matching & Batch Transfer ----------------

function cleanSongTitle(title = "") {
  return String(title)
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/\s*\(with.*?\)/gi, "")
    .replace(/\s*\[with.*?\]/gi, "")
    .replace(/\s*-\s*remaster(?:ed)?(?:\s*\d{4})?/gi, "")
    .replace(/\s*\(remaster(?:ed)?(?:\s*\d{4})?\)/gi, "")
    .replace(/\s*\[remaster(?:ed)?(?:\s*\d{4})?\]/gi, "")
    .replace(/\s*\(explicit\)/gi, "")
    .replace(/\s*\[explicit\]/gi, "")
    .replace(/\s*\(official.*?\)/gi, "")
    .replace(/\s*\[official.*?\]/gi, "")
    .trim();
}

export async function matchSpotifyTrackToAmyMusic(spotifyTrack) {
  if (!spotifyTrack) return null;

  const rawArtist = (spotifyTrack.artists && spotifyTrack.artists[0]) || spotifyTrack.artist || "";
  const allArtists = Array.isArray(spotifyTrack.artists) ? spotifyTrack.artists.join(" ") : rawArtist;
  const rawTitle = spotifyTrack.title || "";
  const cleanedTitle = cleanSongTitle(rawTitle);

  const searchQueries = [
    `${allArtists} ${cleanedTitle}`.trim(),
    `${rawArtist} ${cleanedTitle}`.trim(),
    `${rawArtist} ${rawTitle}`.trim(),
    cleanedTitle
  ].filter(Boolean);

  let bestMatch = null;

  for (const q of searchQueries) {
    try {
      const results = await searchTracks(q);
      if (results && results.length > 0) {
        // Find best match considering title similarity
        const normalizedTarget = cleanedTitle.toLowerCase();
        const found = results.find((r) => {
          const rTitle = (r.title || "").toLowerCase();
          return rTitle.includes(normalizedTarget) || normalizedTarget.includes(rTitle);
        }) || results[0];

        bestMatch = found;
        break;
      }
    } catch (e) {
      // Continue to next query
    }
  }

  if (bestMatch) {
    return {
      ...bestMatch,
      // Retain high quality Spotify artwork if SoundCloud cover is default
      cover: bestMatch.cover && bestMatch.cover !== "/logo.png" ? bestMatch.cover : spotifyTrack.cover,
      spotifyId: spotifyTrack.spotifyId || spotifyTrack.id,
      spotifyUrl: spotifyTrack.spotifyUrl
    };
  }

  // Fallback: create a playable AmyMusic track with Spotify metadata
  // When played, AudioPlayerContext resolveChartTrackViaSoundCloud will find stream on the fly!
  return {
    id: `spotify-${spotifyTrack.spotifyId || spotifyTrack.id || Date.now()}`,
    title: spotifyTrack.title,
    artist: spotifyTrack.artist,
    artists: spotifyTrack.artists || [spotifyTrack.artist],
    album: spotifyTrack.album || "",
    cover: spotifyTrack.cover || "/logo.png",
    duration: spotifyTrack.duration || 0,
    source: "spotify",
    spotifyId: spotifyTrack.spotifyId || spotifyTrack.id,
    permalinkUrl: spotifyTrack.spotifyUrl || "",
    streamUrl: null
  };
}

export async function transferSpotifyTracksBatch(
  tracks = [],
  {
    onProgress,
    signal,
    concurrency = 3
  } = {}
) {
  const total = tracks.length;
  const transferred = [];
  let current = 0;
  let matchedCount = 0;

  // Process tracks with limited concurrency
  const queue = [...tracks];

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) throw new Error("Перенос отменён пользователем");
      const track = queue.shift();
      if (!track) break;

      try {
        const resolved = await matchSpotifyTrackToAmyMusic(track);
        if (resolved) {
          transferred.push(resolved);
          if (resolved.source !== "spotify") {
            matchedCount += 1;
          }
        }
      } catch (err) {
        // Fallback to direct spotify track
        transferred.push({
          id: `spotify-${track.spotifyId || track.id || Date.now()}`,
          title: track.title,
          artist: track.artist,
          artists: track.artists || [track.artist],
          album: track.album || "",
          cover: track.cover || "/logo.png",
          duration: track.duration || 0,
          source: "spotify",
          spotifyId: track.spotifyId || track.id,
          permalinkUrl: track.spotifyUrl || "",
          streamUrl: null
        });
      }

      current += 1;
      if (onProgress) {
        onProgress({
          current,
          total,
          percent: Math.round((current / total) * 100),
          currentTrack: `${track.artist} - ${track.title}`,
          matchedCount
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return transferred;
}
