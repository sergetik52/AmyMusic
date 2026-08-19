import { logDebug, logWarn } from "../utils/logger.js";
import { getSoundCloudRuntimeSettings } from "./profileSettings.js";

function getSoundCloudApiBase() {
  const proxyPort = new URLSearchParams(window.location.search).get("amymusicProxyPort");

  return window.amyMusicConfig?.soundCloudApiBase ||
    (proxyPort ? `http://127.0.0.1:${proxyPort}/api/soundcloud` : "") ||
    import.meta?.env?.VITE_SOUNDCLOUD_API_BASE ||
    "/api/soundcloud";
}
const ENV_SOUNDCLOUD_CLIENT_ID = import.meta?.env?.VITE_SOUNDCLOUD_CLIENT_ID || "";
const DEFAULT_FALLBACK_CLIENT_ID = "yNSW5UvBmb1A5j7qPUtIMuB9Itx3jsOC";

export const emptyTrack = {
  id: "empty",
  title: "Нет трека",
  artist: "Трек не загружен",
  artists: [],
  artistId: "0",
  artistAvatar: "/logo.png",
  artistPermalinkUrl: "",
  mood: "AmyMusic",
  cover: "/logo.png",
  streamUrl: "",
  palette: {
    base: "#2a0a4a",
    line: "#9b5cff",
    bright: "#d8b4fe",
    shadow: "#4c1d95"
  }
};

export const emptyArtist = {
  id: "empty",
  name: "Unknown artist",
  username: "Unknown artist",
  description: "",
  avatar: "/logo.png",
  permalinkUrl: "",
  followers: 0,
  followings: 0,
  trackCount: 0,
  city: "",
  country: "",
  tags: []
};

function getSoundCloudClientId() {
  return (
    getSoundCloudRuntimeSettings().clientId ||
    ENV_SOUNDCLOUD_CLIENT_ID ||
    DEFAULT_FALLBACK_CLIENT_ID
  );
}

function assertClientId() {
  if (!getSoundCloudClientId()) {
    throw new Error("SoundCloud client_id is empty. Add it in profile settings.");
  }
}

function applyRuntimeSettings(url) {
  const settings = getSoundCloudRuntimeSettings();
  const clientId = settings.clientId || ENV_SOUNDCLOUD_CLIENT_ID || DEFAULT_FALLBACK_CLIENT_ID;
  if (clientId) url.searchParams.set("client_id", clientId);
  if (settings.clientSecret) url.searchParams.set("client_secret", settings.clientSecret);
  if (settings.httpProxies) url.searchParams.set("http_proxies", settings.httpProxies);
  return url;
}

function toApiUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("/")) return pathOrUrl;

  const url = new URL(pathOrUrl);
  if (url.hostname === "api-v2.soundcloud.com") {
    return `${getSoundCloudApiBase()}${url.pathname}${url.search}`;
  }

  return pathOrUrl;
}

function withClientId(pathOrUrl) {
  const proxiedUrl = toApiUrl(pathOrUrl);
  const url = new URL(proxiedUrl, window.location.origin);
  applyRuntimeSettings(url);
  return toFetchUrl(url);
}

function toFetchUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : url.pathname + url.search;
}

function getLargeImage(url) {
  return url?.replace("-large", "-t500x500") || "";
}

function normalizeTags(value = "") {
  return String(value)
    .split(/\s+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeSoundCloudArtist(user = {}) {
  return {
    id: String(user.id || ""),
    name: user.full_name || user.username || "Unknown artist",
    username: user.username || user.full_name || "Unknown artist",
    description: user.description || "",
    avatar: getLargeImage(user.avatar_url) || "/logo.png",
    permalinkUrl: user.permalink_url || "",
    followers: user.followers_count || 0,
    followings: user.followings_count || 0,
    trackCount: user.track_count || 0,
    city: user.city || "",
    country: user.country_code || user.country || "",
    tags: normalizeTags(user.description || "")
  };
}

function cleanTrackTitle(value = "") {
  return String(value || "")
    .replace(/\s*\[\s*(?:official\s*(?:audio|video|music\s*video|mv)?|audio|video|mv|hd|4k|hq|explicit|clean|lyric\s*video|lyrics|visualizer|clip)\s*\]/gi, "")
    .replace(/\s*\(\s*(?:official\s*(?:audio|video|music\s*video|mv)?|audio|video|mv|hd|4k|hq|explicit|clean|lyric\s*video|lyrics|visualizer|clip)\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value = "") {
  return cleanTrackTitle(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTopLevelDash(text = "") {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      if (depth > 0) depth -= 1;
    } else if (depth === 0 && (char === "-" || char === "–" || char === "—")) {
      const prev = text[i - 1] || "";
      const next = text[i + 1] || "";
      if (/\s/.test(prev) && /\s/.test(next)) {
        return {
          left: text.slice(0, i).trim(),
          right: text.slice(i + 1).trim()
        };
      }
    }
  }
  return null;
}

function splitArtistNames(value = "") {
  if (!value) return [];
  return cleanTrackTitle(value)
    .replace(/^[\(\[]+|[\)\]]+$/g, "")
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bX\b|feat\.?|ft\.?|\bfeaturing\b|\bwith\b|;)\s*/i)
    .map((name) => name.replace(/^[\s.\-–—:;()[\]]+|[\s.\-–—:;()[\]]+$/g, "").trim())
    .filter((name) => {
      if (!name || name.length < 2 || name.length > 50) return false;
      if (/^\d+$/.test(name)) return false;
      if (/^(prod\.?|producer|prod\s+by|beat\s+by)/i.test(name)) return false;
      return true;
    });
}

function splitTrailingFeatureBlock(value = "") {
  const cleaned = cleanTrackTitle(value);

  // Match (feat. X) or [ft. X] or feat. X or with X
  const featureMatch = cleaned.match(/\s*[\(\[]?\s*(?:feat\.?|ft\.?|\bfeaturing\b|\bwith\b)\s+(.+?)[\)\]]?$/i);
  if (featureMatch && featureMatch.index > 0) {
    const titlePart = cleaned.slice(0, featureMatch.index).replace(/[\(\[]+$/g, "").trim();
    const featurePart = featureMatch[1].replace(/[\)\]]+$/g, "").trim();
    return {
      title: titlePart || cleaned,
      features: featurePart
    };
  }

  return { title: cleaned, features: "" };
}

export function parseCleanTrackInfo(rawTitle = "", defaultArtist = "Unknown artist") {
  const raw = String(rawTitle || "").trim();
  const cleaned = cleanTrackTitle(raw);
  const fallbackStr = typeof defaultArtist === "string" ? defaultArtist : "Unknown artist";

  if (!cleaned) {
    return {
      title: raw || "Без названия",
      artistNames: [fallbackStr]
    };
  }

  let artistNames = [];
  let titleSource = cleaned;

  try {
    // 1. Strict check for top-level "Artist - Track Title" (outside parentheses & brackets)
    const dashMatch = findTopLevelDash(cleaned);
    if (dashMatch) {
      const candidateArtistStr = dashMatch.left;
      const parsedArtists = splitArtistNames(candidateArtistStr);
      if (parsedArtists.length > 0) {
        artistNames = parsedArtists;
        titleSource = dashMatch.right;
      }
    }

    // If no artist from top-level dash, use fallbackStr
    if (!artistNames.length) {
      let safeDefault = String(fallbackStr || "").trim();
      if (
        !safeDefault ||
        safeDefault.includes("(") ||
        safeDefault.includes("[") ||
        safeDefault.length > 50 ||
        normalizeComparable(safeDefault) === normalizeComparable(cleaned)
      ) {
        safeDefault = "Unknown artist";
      }

      const splitDefault = splitArtistNames(safeDefault);
      artistNames = splitDefault.length ? splitDefault : [safeDefault];
    }

    // 2. Check for featured artists in titleSource (e.g. "MB (feat. LIL KRYSTALLL)")
    const splitTitle = splitTrailingFeatureBlock(titleSource);
    const featureNames = splitArtistNames(splitTitle.features);

    // Combine primary artists + feature artists (deduplicated)
    const allArtistNames = [...artistNames];
    featureNames.forEach((featName) => {
      const normFeat = normalizeComparable(featName);
      if (!allArtistNames.some((existing) => normalizeComparable(existing) === normFeat)) {
        allArtistNames.push(featName);
      }
    });

    const finalTitle = splitTitle.title || titleSource || cleaned;

    return {
      title: finalTitle || raw || "Без названия",
      artistNames: allArtistNames.length ? allArtistNames : [fallbackStr]
    };
  } catch (err) {
    logWarn("api", "parseCleanTrackInfo error fallback", err);
    return {
      title: cleaned || raw || "Без названия",
      artistNames: [fallbackStr]
    };
  }
}

export function normalizeTrackMetadata(track = {}) {
  if (!track || typeof track !== "object") return track;
  
  try {
    const rawTitle = track.rawTitle || track.originalTitle || track.title || "";
    
    let uploaderName =
      track.uploaderName ||
      track.username ||
      (typeof track.user?.username === "string" ? track.user.username : "") ||
      (typeof track.user?.full_name === "string" ? track.user.full_name : "") ||
      track.artistUsername ||
      "";

    if (!uploaderName) {
      const candidate = track.artists?.[0]?.name || track.artists?.[0]?.username || (typeof track.artist === "string" ? track.artist : "");
      if (candidate && typeof candidate === "string" && !candidate.includes("(") && !candidate.includes("[") && candidate.length <= 50) {
        uploaderName = candidate;
      }
    }

    const parsed = parseCleanTrackInfo(rawTitle, uploaderName);
    const safeArtistNames = Array.isArray(parsed.artistNames) && parsed.artistNames.length ? parsed.artistNames : ["Unknown artist"];

    const splitUploader = splitArtistNames(uploaderName);

    const artistsObjects = safeArtistNames.map((name) => {
      const normName = normalizeComparable(name);
      const isUploaderMatch =
        uploaderName &&
        (normName === normalizeComparable(uploaderName) ||
          splitUploader.some((u) => normalizeComparable(u) === normName));

      const rawUserAvatar = track.artistAvatar || "";
      const isDefaultAvatar = !rawUserAvatar || rawUserAvatar.includes("default_avatar") || rawUserAvatar.includes("logo.png");
      const trackCover = track.cover || "";
      const validTrackCover = trackCover && !trackCover.includes("logo.png") ? trackCover : "";

      const resolvedAvatar = isUploaderMatch
        ? (!isDefaultAvatar ? rawUserAvatar : (validTrackCover || "/user.svg"))
        : (validTrackCover || "/user.svg");

      return {
        id: isUploaderMatch && track.artistId ? String(track.artistId) : "",
        name,
        username: name,
        avatar: resolvedAvatar,
        permalinkUrl: isUploaderMatch ? (track.artistPermalinkUrl || "") : ""
      };
    });

    return {
      ...track,
      rawTitle,
      title: parsed.title || track.title || "Без названия",
      artist: safeArtistNames.join(", "),
      artists: artistsObjects
    };
  } catch (err) {
    logWarn("api", "normalizeTrackMetadata exception fallback", err);
    return track;
  }
}

function safeNormalizeSoundCloudTrack(item, fallback) {
  try {
    return normalizeSoundCloudTrack(item, fallback);
  } catch (err) {
    logWarn("api", "safeNormalizeSoundCloudTrack error", err);
    const source = item?.track || item || {};
    const rawUserAvatar = getLargeImage(source.user?.avatar_url);
    const isDefaultAvatar = !rawUserAvatar || rawUserAvatar.includes("default_avatar") || rawUserAvatar.includes("logo.png");
    const cover = getLargeImage(source.artwork_url) || fallback?.cover || "";
    const validCover = cover && !cover.includes("logo.png") ? cover : "";
    return {
      id: String(source.id || fallback?.id || Math.random()),
      rawTitle: source.title || fallback?.title || "Без названия",
      title: source.title || fallback?.title || "Без названия",
      artist: source.user?.username || fallback?.artist || "Unknown artist",
      artists: [{ name: source.user?.username || fallback?.artist || "Unknown artist" }],
      artistId: source.user?.id ? String(source.user.id) : "",
      artistAvatar: !isDefaultAvatar ? rawUserAvatar : (validCover || "/user.svg"),
      cover: validCover || "/logo.png",
      streamUrl: "",
      duration: 0
    };
  }
}

function normalizeSoundCloudTrack(track = {}, fallback = {}) {
  const source = track.track || track;
  const user = source.user || fallback.user || {};
  const transcodings = source.media?.transcodings || [];
  const fullTranscodings = transcodings.filter((t) => t.snipped === false);
  const pool = fullTranscodings.length > 0 ? fullTranscodings : transcodings;
  const transcoding =
    pool.find((item) => item.format?.protocol?.includes("progressive")) ||
    pool[0];

  const userArtistName = user.username || user.full_name;
  let artistName = userArtistName || fallback.uploaderName || fallback.username || "";

  if (!artistName) {
    const fallbackCandidate = fallback.artist || "";
    if (fallbackCandidate && !fallbackCandidate.includes("(") && !fallbackCandidate.includes("[")) {
      artistName = fallbackCandidate;
    } else {
      artistName = "Unknown artist";
    }
  }

  const rawUserAvatar = getLargeImage(user.avatar_url);
  const isDefaultUserAvatar = !rawUserAvatar || rawUserAvatar.includes("default_avatar") || rawUserAvatar.includes("logo.png");
  const trackArtwork = getLargeImage(source.artwork_url) || fallback.cover || "";
  const validArtwork = trackArtwork && !trackArtwork.includes("logo.png") ? trackArtwork : "";

  const artistAvatar = !isDefaultUserAvatar ? rawUserAvatar : (validArtwork || "/user.svg");

  const primaryArtist = {
    id: user.id ? String(user.id) : "",
    name: artistName,
    username: artistName,
    avatar: artistAvatar,
    permalinkUrl: user.permalink_url || ""
  };

  const credits = normalizeTrackMetadata({
    rawTitle: source.title || fallback.rawTitle || fallback.title || "",
    title: source.title || fallback.title || "",
    artist: artistName,
    uploaderName: artistName,
    artistId: user.id ? String(user.id) : "",
    artistAvatar,
    artistPermalinkUrl: user.permalink_url || ""
  });

  const isSnippet = transcoding?.snipped === true || (!transcoding && source.policy === "SNIPPET");

  return {
    id: String(source.id || fallback.id || ""),
    rawTitle: credits.rawTitle || source.title || fallback.title || "",
    title: credits.title || source.title || fallback.title || "Без названия",
    artist: credits.artist || artistName,
    artists: credits.artists || [primaryArtist],
    artistId: user.id ? String(user.id) : "",
    artistAvatar,
    artistPermalinkUrl: user.permalink_url || "",
    mood: source.genre || fallback.genre || "AmyMusic",
    cover: getLargeImage(source.artwork_url) || fallback.cover || artistAvatar || "/logo.png",
    streamUrl: transcoding?.url || "",
    isSnippet,
    permalinkUrl: source.permalink_url,
    // SoundCloud returns `duration` = snippet length (30 s) for Go+ tracks.
    // `full_duration` always holds the actual track length — prefer it.
    duration: source.full_duration
      ? source.full_duration / 1000
      : source.duration
        ? source.duration / 1000
        : 0,
    playbackCount: source.playback_count || 0,
    likesCount: source.likes_count || source.favoritings_count || 0,
    createdAt: source.created_at || "",
    palette: emptyTrack.palette
  };
}

async function resolveArtistUser(artist) {
  if (artist?.id && artist.id !== "empty") return artist;
  const name = artist?.username || artist?.name;
  if (!name) return null;

  try {
    const found = await searchArtists(name);
    if (found.length > 0) {
      const normName = normalizeComparable(name);
      const exact = found.find(
        (a) => normalizeComparable(a.username || a.name) === normName
      );
      return exact || found[0];
    }
  } catch (err) {
    logWarn("api", "resolveArtistUser search failed", err);
  }
  return null;
}

export async function getArtistProfile(artist) {
  assertClientId();
  const resolved = await resolveArtistUser(artist);
  const targetId = resolved?.id || artist?.id;

  if (!targetId || targetId === "empty") {
    return {
      id: "",
      name: artist?.name || artist?.username || "Unknown artist",
      username: artist?.username || artist?.name || "Unknown artist",
      avatar: artist?.avatar || "/logo.png",
      followers: 0,
      followings: 0,
      trackCount: 0
    };
  }

  const url = new URL(`${getSoundCloudApiBase()}/users/${targetId}`, window.location.origin);
  applyRuntimeSettings(url);

  try {
    const data = await requestJson(toFetchUrl(url), "getArtistProfile");
    return normalizeSoundCloudArtist(data);
  } catch (error) {
    logWarn("api", "getArtistProfile failed", error);
    return resolved || {
      id: targetId,
      name: artist?.name || artist?.username || "Unknown artist",
      username: artist?.username || artist?.name || "Unknown artist",
      avatar: artist?.avatar || "/logo.png",
      followers: 0
    };
  }
}

export async function getArtistTracks(artist, limit = 200) {
  assertClientId();
  const query = artist?.username || artist?.name || "";
  const resolved = await resolveArtistUser(artist);
  const targetId = resolved?.id || artist?.id;

  const promises = [];
  if (targetId && targetId !== "empty") {
    const url = new URL(`${getSoundCloudApiBase()}/users/${targetId}/tracks`, window.location.origin);
    applyRuntimeSettings(url);
    url.searchParams.set("limit", String(limit));
    promises.push(
      requestJson(toFetchUrl(url), "getArtistTracks")
        .then((data) => (Array.isArray(data) ? data : data.collection || []).map((t) => safeNormalizeSoundCloudTrack(t)))
        .catch((e) => {
          logWarn("api", "getArtistTracks profile fetch failed", e);
          return [];
        })
    );
  }

  if (query) {
    promises.push(
      searchTracksLimited(query, 50).catch((e) => {
        logWarn("api", "getArtistTracks search fallback failed", e);
        return [];
      })
    );
  }

  const results = await Promise.allSettled(promises);
  const trackMap = new Map();

  results.forEach((res) => {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      res.value.forEach((t) => {
        if (t?.id && !trackMap.has(String(t.id))) {
          trackMap.set(String(t.id), t);
        }
      });
    }
  });

  return Array.from(trackMap.values());
}

export async function getArtistAlbums(artist) {
  assertClientId();
  const resolved = await resolveArtistUser(artist);
  const targetId = resolved?.id || artist?.id;

  if (!targetId || targetId === "empty") return [];

  const load = async (path, scope) => {
    const url = new URL(`${getSoundCloudApiBase()}${path}`, window.location.origin);
    applyRuntimeSettings(url);
    url.searchParams.set("limit", "24");
    const data = await requestJson(toFetchUrl(url), scope);
    return (Array.isArray(data) ? data : data.collection || []).map((album) =>
      normalizeSoundCloudAlbum(album, resolved || artist, "album")
    );
  };

  try {
    return await load(`/users/${targetId}/albums`, "getArtistAlbums");
  } catch (error) {
    logWarn("api", "getArtistAlbums failed", error);
    return [];
  }
}

export async function getArtistPlaylists(artist) {
  assertClientId();
  const resolved = await resolveArtistUser(artist);
  const targetId = resolved?.id || artist?.id;

  if (!targetId || targetId === "empty") return [];

  const url = new URL(`${getSoundCloudApiBase()}/users/${targetId}/playlists`, window.location.origin);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", "50");

  try {
    const data = await requestJson(toFetchUrl(url), "getArtistPlaylists");
    return (Array.isArray(data) ? data : data.collection || []).map((playlist) =>
      normalizeSoundCloudAlbum(playlist, resolved || artist, "playlist")
    );
  } catch (error) {
    logWarn("api", "getArtistPlaylists failed", error);
    return [];
  }
}

function normalizeChartItem(item) {
  return normalizeSoundCloudTrack(item.track || item);
}

function normalizeSoundCloudAlbum(album = {}, fallbackArtist = {}, kind = "album") {
  const user = album.user || {};
  const fallbackUser = Object.keys(user).length ? user : {
    id: fallbackArtist.id,
    username: fallbackArtist.username || fallbackArtist.name,
    full_name: fallbackArtist.name,
    avatar_url: fallbackArtist.avatar,
    permalink_url: fallbackArtist.permalinkUrl
  };
  const cover =
    getLargeImage(album.artwork_url) ||
    getLargeImage(album.tracks?.find((track) => track.artwork_url)?.artwork_url) ||
    getLargeImage(fallbackUser.avatar_url) ||
    "/logo.png";
  const artistName = fallbackUser.username || fallbackUser.full_name || "SoundCloud";

  return {
    id: String(album.id || album.permalink_url || album.title),
    title: album.title || "Untitled",
    kind,
    artist: artistName,
    cover,
    permalinkUrl: album.permalink_url || "",
    createdAt: album.created_at || "",
    trackCount: album.track_count || album.tracks?.length || 0,
    tracks: (album.tracks || []).map((track) =>
      normalizeSoundCloudTrack(track.track || track, {
        user: fallbackUser,
        artist: artistName,
        cover,
        title: ""
      })
    )
  };
}

function shouldHydrateTrack(track) {
  return Boolean(track?.id) && (!track.streamUrl || !track.duration || !track.permalinkUrl);
}

async function getTrackDetails(track, fallback = {}) {
  const loadSingle = async () => {
    const url = new URL(`${getSoundCloudApiBase()}/tracks/${track.id}`, window.location.origin);
    applyRuntimeSettings(url);
    return requestJson(toFetchUrl(url), "getTrackDetails");
  };

  const loadByIds = async () => {
    const url = new URL(`${getSoundCloudApiBase()}/tracks`, window.location.origin);
    url.searchParams.set("ids", track.id);
    applyRuntimeSettings(url);
    const data = await requestJson(toFetchUrl(url), "getTrackDetailsByIds");
    return Array.isArray(data) ? data[0] : data?.collection?.[0];
  };

  try {
    return normalizeSoundCloudTrack(await loadSingle(), fallback);
  } catch (error) {
    logWarn("api", "getTrackDetails single failed, trying ids endpoint", error);
    return normalizeSoundCloudTrack(await loadByIds(), fallback);
  }
}

async function hydrateAlbumTracks(album, artist = {}) {
  if (!album?.tracks?.length) return album;

  const fallbackUser = {
    id: artist.id,
    username: artist.username || artist.name || album.artist,
    full_name: artist.name || album.artist,
    avatar_url: artist.avatar,
    permalink_url: artist.permalinkUrl
  };

  const hydrated = await Promise.allSettled(
    album.tracks.map(async (track) => {
      if (!shouldHydrateTrack(track)) return track;

      const detailedTrack = await getTrackDetails(track, {
        user: fallbackUser,
        artist: album.artist || artist.username || artist.name,
        cover: track.cover || album.cover,
        title: track.title
      });

      return {
        ...track,
        ...detailedTrack,
        rawTitle: detailedTrack.rawTitle || track.rawTitle || track.title,
        cover: detailedTrack.cover || track.cover || album.cover,
        artist: detailedTrack.artist || track.artist || album.artist,
        title: detailedTrack.title || track.title
      };
    })
  );

  return {
    ...album,
    tracks: hydrated.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      logWarn("api", "album track hydration failed", {
        albumId: album.id,
        trackId: album.tracks[index]?.id,
        reason: result.reason?.message
      });
      return album.tracks[index];
    })
  };
}

export async function hydrateSoundCloudTracks(tracks = [], fallback = {}) {
  if (!tracks.length) return [];

  const hydrated = await Promise.allSettled(
    tracks.map(async (track) => {
      const shouldLoad =
        fallback.forceMetadata ||
        shouldHydrateTrack(track) ||
        !track.title ||
        track.title === "Untitled" ||
        track.title === "Без названия";

      if (!shouldLoad) return track;

      const detailedTrack = await getTrackDetails(track, {
        artist: fallback.artist || track.artist,
        cover: track.cover || fallback.cover,
        title: track.rawTitle || track.title
      });

      return {
        ...track,
        ...detailedTrack,
        rawTitle: detailedTrack.rawTitle || track.rawTitle || track.title,
        cover: detailedTrack.cover || track.cover || fallback.cover,
        artist: detailedTrack.artist || track.artist || fallback.artist,
        title: detailedTrack.title || track.title
      };
    })
  );

  return hydrated.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    logWarn("api", "track hydration failed", {
      trackId: tracks[index]?.id,
      reason: result.reason?.message
    });
    return tracks[index];
  });
}

export function buildArtistsFromTracks(tracks) {
  const artists = new Map();

  tracks.forEach((track) => {
    const trackArtists = track.artists?.length
      ? track.artists
      : [{
        id: track.artistId || "",
        name: track.artist,
        username: track.artist,
        avatar: (track.artistAvatar && !track.artistAvatar.includes("logo.png")) ? track.artistAvatar : ((track.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg"),
        permalinkUrl: track.artistPermalinkUrl || ""
      }];

    trackArtists.forEach((artist) => {
      const key = artist.id || artist.name || artist.username;
      if (!key || artists.has(key)) return;

      const validAvatar = (artist.avatar && !artist.avatar.includes("logo.png"))
        ? artist.avatar
        : ((track.artistAvatar && !track.artistAvatar.includes("logo.png"))
          ? track.artistAvatar
          : ((track.cover && !track.cover.includes("logo.png")) ? track.cover : "/user.svg"));

      artists.set(key, {
        id: artist.id || "",
        name: artist.name || artist.username,
        username: artist.username || artist.name,
        description: "",
        avatar: validAvatar,
        permalinkUrl: artist.permalinkUrl || "",
        followers: 0,
        followings: 0,
        trackCount: 0,
        city: "",
        country: "",
        tags: []
      });
    });
  });

  return [...artists.values()].slice(0, 16);
}

async function requestJson(url, scope) {
  logDebug("api", `${scope}: request`, { url });

  try {
    const response = await fetch(url);
    const body = await response.text();
    const contentType = response.headers.get("content-type") || "";

    logDebug("api", `${scope}: response`, {
      status: response.status,
      ok: response.ok,
      contentType
    });

    if (!response.ok) {
      throw new Error(`SoundCloud request failed: ${response.status} ${body}`);
    }

    try {
      return JSON.parse(body);
    } catch (parseError) {
      throw new Error(
        `SoundCloud returned non-JSON for ${scope}: ${response.status} ${contentType} ${body.slice(0, 120)}`
      );
    }
  } catch (error) {
    logWarn("api", `${scope}: failed`, error);
    throw error;
  }
}

export async function resolveStreamUrl(track) {
  assertClientId();
  if (!track?.streamUrl) {
    if (track?.id && track.id !== "empty") {
      const detailedTrack = await getTrackDetails(track, {
        artist: track.artist,
        cover: track.cover,
        title: track.rawTitle || track.title
      });

      if (detailedTrack?.streamUrl) {
        Object.assign(track, {
          ...detailedTrack,
          rawTitle: detailedTrack.rawTitle || track.rawTitle || track.title,
          cover: detailedTrack.cover || track.cover,
          artist: detailedTrack.artist || track.artist,
          title: detailedTrack.title || track.title
        });
      }
    }

  if (!track?.streamUrl) {
      throw new Error("Track has no SoundCloud transcoding URL");
    }
  }

  let targetStreamUrl = track.streamUrl;

  if (track.isSnippet) {
    try {
      logDebug("api", `Track is a snippet, searching for alternative: ${track.artist} ${track.title}`);
      const fallbackTracks = await searchTracks(`${track.artist} ${track.title}`);
      const validFallback = fallbackTracks.find((t) => !t.isSnippet && t.streamUrl);
      if (validFallback) {
        logDebug("api", `Found alternative track for snippet: ${validFallback.id}`);
        targetStreamUrl = validFallback.streamUrl;
      } else {
        logWarn("api", "No alternative track found for snippet");
      }
    } catch (e) {
      logWarn("api", "Failed to search for alternative track", e);
    }
  }

  const streamApiUrl = withClientId(targetStreamUrl);
  const data = await requestJson(streamApiUrl, "resolveStreamUrl");

  if (!data.url) {
    throw new Error("SoundCloud stream resolver returned empty url");
  }

  return data.url;
}

export async function searchTracks(query) {
  assertClientId();

  const url = new URL(`${getSoundCloudApiBase()}/search/tracks`, window.location.origin);
  url.searchParams.set("q", query);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", "20");

  const data = await requestJson(toFetchUrl(url), "searchTracks");
  return (data.collection || []).map(normalizeSoundCloudTrack);
}

async function searchTracksLimited(query, limit = 12) {
  assertClientId();

  const url = new URL(`${getSoundCloudApiBase()}/search/tracks`, window.location.origin);
  url.searchParams.set("q", query);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", String(limit));

  const data = await requestJson(toFetchUrl(url), `searchTracks:${query}`);
  return (data.collection || []).map(normalizeSoundCloudTrack);
}

export async function searchArtists(query) {
  assertClientId();

  const url = new URL(`${getSoundCloudApiBase()}/search/users`, window.location.origin);
  url.searchParams.set("q", query);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", "24");

  const data = await requestJson(toFetchUrl(url), "searchArtists");
  return (data.collection || []).map(normalizeSoundCloudArtist);
}

export async function searchAlbums(query) {
  assertClientId();

  const load = async (path, scope) => {
    const url = new URL(`${getSoundCloudApiBase()}${path}`, window.location.origin);
    url.searchParams.set("q", query);
    applyRuntimeSettings(url);
    url.searchParams.set("limit", "24");
    const data = await requestJson(toFetchUrl(url), scope);
    return (data.collection || []).map((album) =>
      normalizeSoundCloudAlbum(album, album.user ? normalizeSoundCloudArtist(album.user) : {}, path.includes("playlists") ? "playlist" : "album")
    );
  };

  try {
    return await load("/search/albums", "searchAlbums");
  } catch (error) {
    logWarn("api", "searchAlbums failed, trying playlists", error);
    return load("/search/playlists", "searchPlaylists");
  }
}

export async function searchPlaylists(query) {
  assertClientId();
  const url = new URL(`${getSoundCloudApiBase()}/search/playlists`, window.location.origin);
  url.searchParams.set("q", query);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", "24");
  const data = await requestJson(toFetchUrl(url), "searchPlaylists");
  return (data.collection || []).map((album) =>
    normalizeSoundCloudAlbum(album, album.user ? normalizeSoundCloudArtist(album.user) : {}, "playlist")
  );
}

export async function getTrackAlbum(track) {
  if (!track) return null;
  if (track.album || track.release) return track.album || track.release;

  try {
    const artistName = track.artist || "";
    const title = track.title || "";
    const query = `${artistName} ${title}`.trim();
    if (query) {
      const albums = await searchAlbums(query);
      if (albums && albums.length > 0) {
        const matched = albums.find((a) => 
          (a.artist && a.artist.toLowerCase() === artistName.toLowerCase()) ||
          (a.title && a.title.toLowerCase().includes(title.toLowerCase()))
        ) || albums[0];
        if (matched) return matched;
      }
    }
  } catch (e) {
    logWarn("api", "getTrackAlbum search failed", e);
  }

  return {
    id: `single-${track.id}`,
    title: track.title,
    kind: "single",
    artist: track.artist,
    artistId: track.artistId,
    artistAvatar: track.artistAvatar || track.cover,
    cover: track.cover,
    trackCount: 1,
    tracks: [track]
  };
}


export async function getAlbumDetails(album, artist = {}) {
  assertClientId();
  if (!album?.id) return album;

  const url = new URL(`${getSoundCloudApiBase()}/playlists/${album.id}`, window.location.origin);
  applyRuntimeSettings(url);

  try {
    const data = await requestJson(toFetchUrl(url), "getAlbumDetails");
    return hydrateAlbumTracks(normalizeSoundCloudAlbum(data, artist, album.kind || "playlist"), artist);
  } catch (error) {
    logWarn("api", "getAlbumDetails failed, using listed album", error);
    return hydrateAlbumTracks(normalizeSoundCloudAlbum(album, artist, album.kind || "playlist"), artist);
  }
}

export async function getRelatedArtists(artist) {
  assertClientId();
  const resolved = await resolveArtistUser(artist);
  const targetId = resolved?.id || artist?.id;

  if (targetId && targetId !== "empty") {
    try {
      const url = new URL(`${getSoundCloudApiBase()}/users/${targetId}/followings`, window.location.origin);
      url.searchParams.set("limit", "12");
      applyRuntimeSettings(url);

      const data = await requestJson(toFetchUrl(url), "getRelatedArtists");
      const followings = (data.collection || []).map(normalizeSoundCloudArtist);
      
      if (followings.length > 0) {
        return followings;
      }
    } catch (error) {
      logWarn("api", "getRelatedArtists followings failed, falling back to search", error);
    }
  }

  if (!artist?.username && !artist?.name) return [];

  const artists = await searchArtists(artist.username || artist.name);
  return artists
    .filter((item) => item.id !== (targetId || artist.id))
    .slice(0, 12);
}

async function getRelatedTracks(track, limit = 18) {
  assertClientId();
  if (!track?.id || track.id === "empty") return [];

  const url = new URL(`${getSoundCloudApiBase()}/tracks/${track.id}/related`, window.location.origin);
  applyRuntimeSettings(url);
  url.searchParams.set("limit", String(limit));

  const data = await requestJson(toFetchUrl(url), "getRelatedTracks");
  return (data.collection || []).map(normalizeChartItem);
}

function splitFeatureArtists(track) {
  const text = `${track?.artist || ""} ${track?.title || ""}`;
  return text
    .split(/,|&|\+| x | feat\.?| ft\.?|with|\//i)
    .map((part) => part.replace(/\(.*?\)|\[.*?\]/g, "").trim())
    .filter((part) => part.length >= 2 && part.length <= 48);
}

function getTitleTokens(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 5);
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function addWeightedCount(map, key, amount = 1) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function getWeightedValue(map, key) {
  return map.get(normalizeKey(key)) || 0;
}

function getSeedTracks({ likedTracks = [], playHistory = [], currentTrack }) {
  const seeds = new Map();
  const maxLength = Math.max(likedTracks.length, playHistory.length);

  for (let index = 0; index < maxLength; index += 1) {
    [playHistory[index], likedTracks[index]].forEach((track) => {
      if (track?.id && track.id !== "empty" && !seeds.has(track.id)) {
        seeds.set(track.id, track);
      }
    });
  }

  if (currentTrack?.id && currentTrack.id !== "empty" && !seeds.has(currentTrack.id)) {
    seeds.set(currentTrack.id, currentTrack);
  }

  return [...seeds.values()].slice(0, 36);
}

function buildWaveQueries(seeds, context) {
  const queries = new Set();
  const topArtists = [...context.artistWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([artist]) => artist);
  const topGenres = [...context.genreWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);

  topGenres.forEach((genre) => {
    if (genre && genre !== "soundcloud") queries.add(genre);
  });

  topArtists.forEach((artist) => {
    queries.add(artist);
    topGenres.slice(0, 2).forEach((genre) => {
      if (genre && genre !== "soundcloud") queries.add(`${artist} ${genre}`);
    });
  });

  seeds.slice(0, 24).forEach((track) => {
    splitFeatureArtists(track).slice(0, 2).forEach((artist) => queries.add(artist));
    getTitleTokens(track.title).slice(0, 1).forEach((token) => {
      const genre = normalizeKey(track.mood);
      if (genre && genre !== "soundcloud") queries.add(`${token} ${genre}`);
    });
  });

  if (!queries.size) {
    queries.add("dark underground rap");
    queries.add("phonk underground");
    queries.add("alternative hip hop");
  }

  return [...queries].slice(0, 18);
}

function scoreWaveTrack(track, context) {
  const artist = normalizeKey(track.artist);
  const genre = normalizeKey(track.mood);
  const title = String(track.title || "").toLowerCase();
  let score = 0;
  const artistWeight = getWeightedValue(context.artistWeights, artist);
  const genreWeight = getWeightedValue(context.genreWeights, genre);
  const dislikedArtistWeight = getWeightedValue(context.dislikedArtistWeights, artist);
  const dislikedGenreWeight = getWeightedValue(context.dislikedGenreWeights, genre);

  score += Math.min(46, artistWeight * 11);
  score += Math.min(34, genreWeight * 9);
  score -= Math.min(130, dislikedArtistWeight * 42);
  score -= Math.min(60, dislikedGenreWeight * 20);

  context.titleTokens.forEach((token) => {
    if (title.includes(token)) score += 10;
  });

  score += Math.min(34, Math.log10((track.playbackCount || 0) + 1) * 6);
  score += Math.min(18, Math.log10((track.likesCount || 0) + 1) * 4);

  if (context.historyIds.has(track.id)) score -= 8;
  if (context.likedIds.has(track.id)) score += 12;
  if (context.dislikedIds.has(track.id)) score -= 1000;

  return score;
}

function buildWaveContext({ likedTracks, playHistory, dislikedTracks, dislikedIds }) {
  const artistWeights = new Map();
  const genreWeights = new Map();
  const dislikedArtistWeights = new Map();
  const dislikedGenreWeights = new Map();
  const titleTokens = new Set();

  playHistory.forEach((track, index) => {
    const recency = Math.max(0.25, 1 - index / 120);
    addWeightedCount(artistWeights, track.artist, 0.8 * recency);
    addWeightedCount(genreWeights, track.mood, 0.65 * recency);
    getTitleTokens(track.title).forEach((token) => titleTokens.add(token));
  });

  likedTracks.forEach((track, index) => {
    const recency = Math.max(0.55, 1 - index / 180);
    addWeightedCount(artistWeights, track.artist, 1.25 * recency);
    addWeightedCount(genreWeights, track.mood, 1.05 * recency);
    getTitleTokens(track.title).forEach((token) => titleTokens.add(token));
  });

  dislikedTracks.forEach((track) => {
    addWeightedCount(dislikedArtistWeights, track.artist, 1);
    addWeightedCount(dislikedGenreWeights, track.mood, 1);
  });

  return {
    likedIds: new Set(likedTracks.map((track) => String(track.id))),
    historyIds: new Set(playHistory.map((track) => String(track.id))),
    dislikedIds,
    artistWeights,
    genreWeights,
    dislikedArtistWeights,
    dislikedGenreWeights,
    titleTokens
  };
}

function diversifyWaveTracks(scoredTracks, limit = 60) {
  const artistCounts = new Map();
  const result = [];

  for (const item of scoredTracks) {
    const artist = normalizeKey(item.track.artist);
    const currentCount = artistCounts.get(artist) || 0;
    const maxPerArtist = result.length < 20 ? 2 : 4;
    if (artist && currentCount >= maxPerArtist) continue;
    artistCounts.set(artist, currentCount + 1);
    result.push(item.track);
    if (result.length >= limit) break;
  }

  if (result.length >= Math.min(limit, 20)) return result;

  for (const item of scoredTracks) {
    if (result.some((track) => track.id === item.track.id)) continue;
    result.push(item.track);
    if (result.length >= limit) break;
  }

  return result;
}

export async function getPersonalWaveTracks({
  likedTracks = [],
  dislikedTrackIds = new Set(),
  dislikedTracks = [],
  playHistory = [],
  currentTrack = null
} = {}) {
  const seeds = getSeedTracks({ likedTracks, playHistory, currentTrack });
  const dislikedIds = new Set([...dislikedTrackIds].map(String));
  
  // Combine explicit dislikedTracks with any matching history/likes
  const inferredDisliked = [...playHistory, ...likedTracks, currentTrack].filter((track) =>
    track?.id && dislikedIds.has(String(track.id))
  );
  const allDislikedMap = new Map();
  [...inferredDisliked, ...dislikedTracks].forEach((t) => {
    if (t?.id && t.id !== "empty") {
      allDislikedMap.set(String(t.id), t);
    }
  });
  const combinedDislikedTracks = [...allDislikedMap.values()];

  const context = buildWaveContext({ likedTracks, playHistory, dislikedTracks: combinedDislikedTracks, dislikedIds });
  const queries = buildWaveQueries(seeds, context).slice(0, 10);
  const relatedSeeds = seeds.slice(0, 5);
  const results = await Promise.allSettled([
    ...relatedSeeds.map((track) => getRelatedTracks(track, 8)),
    ...queries.map((query) => searchTracksLimited(query, 8))
  ]);

  const candidates = new Map();
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((track) => {
      if (!track?.id || dislikedIds.has(String(track.id))) return;
      if (!candidates.has(track.id)) candidates.set(track.id, track);
    });
  });

  const scoredTracks = [...candidates.values()]
    .map((track) => ({ track, score: scoreWaveTrack(track, context) }))
    .sort((a, b) => b.score - a.score);

  return diversifyWaveTracks(scoredTracks, 60);
}

export async function getRecommendedTracks() {
  assertClientId();

  const url = new URL(`${getSoundCloudApiBase()}/charts`, window.location.origin);
  url.searchParams.set("kind", "trending");
  url.searchParams.set("genre", "soundcloud:genres:all-music");
  applyRuntimeSettings(url);
  url.searchParams.set("limit", "20");

  const data = await requestJson(toFetchUrl(url), "getRecommendedTracks");
  return (data.collection || []).map(normalizeChartItem);
}

export async function getWaveTracks(query = "electronic") {
  return searchTracks(query);
}

// ─── TrackDNA Wave Algorithm ───────────────────────────────────────────────────
//
// Builds a personalized wave starting from a single "seed" track using a
// multi-axis similarity model. Instead of simple artist/title matching, we
// decompose the track into 5 independent DNA dimensions:
//
//  1. GENRE FAMILY    – maps the track's genre to a family tree of related genres
//  2. ENERGY CLASS    – infers tempo/energy bracket from track duration + title keywords
//  3. MOOD PALETTE    – detects mood tokens in title/genre (dark, chill, hard, lofi…)
//  4. POPULARITY BAND – groups tracks into micro/mid/mainstream tiers so the wave
//                       respects the track's "underground vs mainstream" vibe
//  5. SONIC ORBIT     – uses SoundCloud's own related endpoint as a proximity signal
//
// Candidates from all axes are merged, scored by a weighted sum across dimensions,
// and diversified so no single artist dominates the wave.

const GENRE_FAMILIES = {
  "hip-hop":    ["rap", "trap", "phonk", "drill", "boom bap", "lofi hip hop", "cloud rap", "emo rap", "grime"],
  "rap":        ["hip-hop", "trap", "drill", "phonk", "boom bap", "cloud rap"],
  "trap":       ["hip-hop", "rap", "phonk", "drill", "dark trap", "plugg", "cloud rap"],
  "phonk":      ["trap", "dark trap", "drift phonk", "memphis rap", "rap"],
  "drill":      ["rap", "trap", "uk drill", "chicago drill", "brooklyn drill"],
  "electronic": ["edm", "house", "techno", "synthwave", "electro", "ambient", "bass", "dubstep"],
  "house":      ["electronic", "deep house", "tech house", "future house", "edm"],
  "techno":     ["electronic", "industrial", "tech house", "minimal techno"],
  "dubstep":    ["electronic", "bass", "brostep", "riddim", "future bass"],
  "pop":        ["dance pop", "synth pop", "indie pop", "electropop", "bedroom pop"],
  "indie":      ["indie pop", "indie rock", "lo-fi", "alternative", "dream pop"],
  "rock":       ["alternative", "indie rock", "punk", "metal", "grunge", "post-rock"],
  "metal":      ["heavy metal", "death metal", "black metal", "metalcore", "rock"],
  "r&b":        ["soul", "neo soul", "funk", "rnb", "urban", "alternative r&b"],
  "lofi":       ["lo-fi", "lofi hip hop", "chillhop", "study music", "ambient"],
  "ambient":    ["lofi", "chillout", "atmospheric", "drone", "space music"],
  "jazz":       ["soul", "nu jazz", "jazz fusion", "blues", "bebop"],
  "classical":  ["orchestral", "piano", "cinematic", "neoclassical", "soundtrack"],
  "reggae":     ["dancehall", "dub", "roots", "ska"],
  "latin":      ["reggaeton", "salsa", "cumbia", "bachata", "urbano latino"]
};

const MOOD_TOKENS = {
  dark:    ["dark", "evil", "sinister", "gloomy", "noir", "menacing", "brutal", "cold", "ominous"],
  chill:   ["chill", "relax", "calm", "lofi", "lo-fi", "mellow", "smooth", "vibes", "easy"],
  hard:    ["hard", "aggressive", "heavy", "rage", "angry", "loud", "intense", "savage"],
  sad:     ["sad", "melancholy", "cry", "pain", "heartbreak", "emo", "alone", "lost"],
  happy:   ["happy", "fun", "party", "joy", "feel good", "upbeat", "dance", "summer"],
  epic:    ["epic", "cinematic", "orchestral", "powerful", "massive", "huge", "anthem"],
  dreamy:  ["dream", "haze", "cloud", "float", "space", "ethereal", "wave", "vapor"]
};

function detectMoodTokens(track) {
  const text = `${track.title || ""} ${track.mood || ""}`.toLowerCase();
  const detected = new Set();
  for (const [mood, tokens] of Object.entries(MOOD_TOKENS)) {
    if (tokens.some((token) => text.includes(token))) {
      detected.add(mood);
    }
  }
  return detected;
}

function getGenreFamily(genre = "") {
  const normalized = genre.toLowerCase().trim();
  // Direct match
  if (GENRE_FAMILIES[normalized]) return [normalized, ...GENRE_FAMILIES[normalized]];
  // Partial match – find the closest family
  for (const [key, relatives] of Object.entries(GENRE_FAMILIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return [key, ...relatives];
    }
    if (relatives.some((r) => normalized.includes(r) || r.includes(normalized))) {
      return [key, ...relatives];
    }
  }
  return [normalized].filter(Boolean);
}

// Energy class: 0=ambient/slow, 1=mid, 2=energetic/fast
function getEnergyClass(track) {
  const dur = track.duration || 0;
  const text = `${track.title || ""} ${track.mood || ""}`.toLowerCase();
  const slowWords = ["ambient", "lofi", "lo-fi", "sleep", "relax", "slow", "calm", "chill", "acoustic", "piano"];
  const fastWords = ["trap", "drill", "phonk", "hard", "rage", "banger", "aggressive", "bass", "edm", "party", "dance"];
  if (slowWords.some((w) => text.includes(w))) return 0;
  if (fastWords.some((w) => text.includes(w))) return 2;
  if (dur > 0 && dur < 130) return 2; // Very short tracks tend to be energetic
  if (dur > 300) return 0; // Long tracks tend to be atmospheric
  return 1;
}

// Popularity band: 0=underground (<10k plays), 1=mid (10k-500k), 2=mainstream (>500k)
function getPopularityBand(track) {
  const plays = track.playbackCount || 0;
  if (plays < 10000) return 0;
  if (plays < 500000) return 1;
  return 2;
}

function buildTrackDNA(track) {
  return {
    genreFamily: getGenreFamily(track.mood),
    moodTokens: detectMoodTokens(track),
    energyClass: getEnergyClass(track),
    popularityBand: getPopularityBand(track)
  };
}

function scoreTrackByDNA(candidate, dna, excludeIds, dislikedArtistWeights = new Map(), dislikedGenreWeights = new Map()) {
  if (excludeIds.has(String(candidate.id))) return -1000;

  let score = 0;
  const artist = normalizeKey(candidate.artist);
  const genre = normalizeKey(candidate.mood);
  const cEnergy = getEnergyClass(candidate);
  const cBand = getPopularityBand(candidate);
  const cMoods = detectMoodTokens(candidate);

  const dislikedArtistWeight = dislikedArtistWeights.get(artist) || 0;
  const dislikedGenreWeight = dislikedGenreWeights.get(genre) || 0;

  score -= Math.min(130, dislikedArtistWeight * 42);
  score -= Math.min(60, dislikedGenreWeight * 20);

  // 1. Genre family match (up to 50 pts)
  const genreMatchDepth = dna.genreFamily.findIndex((g) => normalizeKey(g) === genre || genre.includes(g) || g.includes(genre));
  if (genreMatchDepth === 0) score += 50;       // exact genre
  else if (genreMatchDepth === 1) score += 35;  // direct relative
  else if (genreMatchDepth > 1) score += 20;    // extended family
  else if (dna.genreFamily.length > 0) score -= 10; // genre mismatch

  // 2. Mood overlap (up to 30 pts)
  const moodOverlap = [...dna.moodTokens].filter((m) => cMoods.has(m)).length;
  score += Math.min(30, moodOverlap * 15);

  // 3. Energy class match (up to 25 pts)
  if (cEnergy === dna.energyClass) score += 25;
  else if (Math.abs(cEnergy - dna.energyClass) === 1) score += 10; // adjacent class

  // 4. Popularity band (up to 20 pts) – prefer same vibe (underground stays underground)
  if (cBand === dna.popularityBand) score += 20;
  else if (Math.abs(cBand - dna.popularityBand) === 1) score += 8;

  // 5. Popularity signal – slight boost for notable tracks
  score += Math.min(12, Math.log10((candidate.playbackCount || 0) + 1) * 2);
  score += Math.min(6, Math.log10((candidate.likesCount || 0) + 1) * 1.2);

  return score;
}

async function buildTrackWaveQueries(track, dna) {
  const queries = new Set();
  const genre = normalizeKey(track.mood);
  const moods = [...dna.moodTokens];

  // Primary genre queries
  dna.genreFamily.slice(0, 4).forEach((g) => {
    if (g && g !== "soundcloud" && g !== "amymusic") queries.add(g);
  });

  // Mood + genre combos
  moods.slice(0, 2).forEach((mood) => {
    if (genre && genre !== "soundcloud") queries.add(`${mood} ${genre}`);
    queries.add(mood);
  });

  // Energy-flavored queries
  if (dna.energyClass === 0) {
    if (genre) queries.add(`chill ${genre}`);
    queries.add("atmospheric ambient");
  } else if (dna.energyClass === 2) {
    if (genre) queries.add(`hard ${genre}`);
    queries.add("aggressive energetic");
  }

  // Fallback if genre is vague
  if (!genre || genre === "soundcloud" || genre === "amymusic") {
    queries.add("dark underground");
    queries.add("alternative indie");
  }

  return [...queries].filter(Boolean).slice(0, 8);
}

export async function getTrackWaveTracks(seedTrack, { excludeIds = new Set(), likedTracks = [], dislikedTrackIds = new Set(), dislikedTracks = [] } = {}) {
  if (!seedTrack?.id || seedTrack.id === "empty") return [];

  const dna = buildTrackDNA(seedTrack);
  const queries = await buildTrackWaveQueries(seedTrack, dna);
  const allExclude = new Set([...excludeIds, ...dislikedTrackIds].map(String));

  // Build dislike weights for penalization
  const dislikedArtistWeights = new Map();
  const dislikedGenreWeights = new Map();
  dislikedTracks.forEach((track) => {
    addWeightedCount(dislikedArtistWeights, track.artist, 1);
    addWeightedCount(dislikedGenreWeights, track.mood, 1);
  });

  // Fetch from multiple axes in parallel
  const results = await Promise.allSettled([
    // Axis 1: SoundCloud's own related (sonic proximity)
    getRelatedTracks(seedTrack, 20),
    // Axis 2: Genre family searches
    ...queries.slice(0, 6).map((q) => searchTracksLimited(q, 10)),
    // Axis 3: If we know the artist, get more from artist's genre orbit
    ...(seedTrack.artist && seedTrack.artist !== "Unknown artist"
      ? [searchTracksLimited(`${seedTrack.artist} ${normalizeKey(seedTrack.mood) || ""}`.trim(), 8)]
      : [])
  ]);

  // Merge all candidates
  const candidates = new Map();
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((track) => {
      if (!track?.id || allExclude.has(String(track.id))) return;
      if (String(track.id) === String(seedTrack.id)) return;
      if (!candidates.has(track.id)) candidates.set(track.id, track);
    });
  });

  // Score by DNA similarity and penalize disliked artist/genre
  const likedIds = new Set(likedTracks.map((t) => String(t.id)));
  const scoredTracks = [...candidates.values()]
    .map((track) => {
      let score = scoreTrackByDNA(track, dna, allExclude, dislikedArtistWeights, dislikedGenreWeights);
      // Liked tracks get a boost
      if (likedIds.has(String(track.id))) score += 18;
      return { track, score };
    })
    .filter(({ score }) => score > -500)
    .sort((a, b) => b.score - a.score);

  // Diversify: max 3 per artist in first 20, max 5 overall
  return diversifyWaveTracks(scoredTracks, 60);
}

