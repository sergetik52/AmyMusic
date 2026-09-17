// ==========================================
// Advanced Lyrics Aggregator
// Sources: LRCLIB (Primary), NetEase (Secondary via proxy)
// ==========================================

export function cleanTrackTitle(title = "") {
  return title
    .replace(/\s*\(.*?\)/g, "")
    .replace(/\s*\[.*?\]/g, "")
    .replace(/\s*-.*$/g, "")
    .replace(/feat\..*$/i, "")
    .replace(/ft\..*$/i, "")
    .trim();
}

export function getSearchArtistToken(artistName = "") {
  const words = artistName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return artistName;
  const genericPrefixes = new Set(["the", "a", "an", "dj", "mc", "lil", "big", "young", "mr", "dr"]);
  if (words.length >= 2 && genericPrefixes.has(words[0].toLowerCase())) {
    return `${words[0]} ${words[1]}`;
  }
  return words[0];
}

export function getLyricsSignature(track) {
  const title = track?.title || track?.name || "";
  const artist = track?.artist || track?.author || track?.artistName || track?.publisher_metadata?.artist || "";
  
  return {
    trackName: cleanTrackTitle(title) || title,
    fullArtistName: artist,
    searchArtistToken: getSearchArtistToken(artist),
    duration: track?.duration || 0,
    titleCandidates: [cleanTrackTitle(title), title].filter(Boolean),
    artistCandidates: [getSearchArtistToken(artist), artist].filter(Boolean)
  };
}


const LRCLIB_BASE = "https://lrclib.net/api";

// Public NetEase API proxies for fallback
const NETEASE_PROXIES = [
  "https://neteasecloudmusicapi.vercel.app",
  "https://autumnfish.cn"
];

function timestampToSeconds(timestamp) {
  if (!timestamp) return 0;
  const parts = timestamp.split(":");
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  return 0;
}

function parseSyncedLyrics(syncedLyrics = "") {
  return syncedLyrics
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[(\d+:\d{2}(?:\.\d{1,3})?)]/g)];
      const text = line.replace(/\[(\d+:\d{2}(?:\.\d{1,3})?)]/g, "").trim();
      return matches
        .map((match) => ({ time: timestampToSeconds(match[1]), text }))
        .filter((item) => item.time !== null && item.text);
    })
    .sort((a, b) => a.time - b.time);
}

function parsePlainLyrics(plainLyrics = "", duration = 0) {
  const lines = plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const step = duration > 0 ? Math.max(1.6, duration / (lines.length + 1)) : 3.4;
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ time: step * (index + 0.7), text, index, estimated: true }));
}

function normalizeLyricsRecord(record, requestedDuration = 0, source = "LRCLIB") {
  if (!record || record.instrumental) {
    return {
      status: record?.instrumental ? "instrumental" : "empty",
      source,
      lines: []
    };
  }

  const syncedLines = parseSyncedLyrics(record.syncedLyrics || "");
  const plainLines = parsePlainLyrics(record.plainLyrics || "", requestedDuration || record.duration || 0);

  return {
    status: syncedLines.length ? "synced" : plainLines.length ? "plain" : "empty",
    source,
    id: record.id,
    trackName: record.trackName || record.name || "Unknown Track",
    artistName: record.artistName || "Unknown Artist",
    albumName: record.albumName || "",
    lines: syncedLines.length ? syncedLines : plainLines
  };
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

// ------------------------------------------------
// LRCLIB Fetcher
// ------------------------------------------------
async function requestLRCLIB(endpoint, params, signal) {
  const url = new URL(LRCLIB_BASE + endpoint);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    headers: { "LrcLib-Client": "Amymusic (https://github.com/sergetik52/AmyMusic)" },
    signal
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`);
  return await res.json();
}

async function fetchFromLRCLIB(title, artist, duration, signature, signal) {
  const mainToken = signature.searchArtistToken || signature.fullArtistName;
  if (!title) return null;

  // 1. Try exact GET
  if (mainToken && title) {
    try {
      const getParams = { track_name: title, artist_name: mainToken };
      if (duration > 0) getParams.duration = duration;
      const directRecord = await requestLRCLIB("/get", getParams, signal);
      if (directRecord && (directRecord.syncedLyrics || directRecord.plainLyrics)) {
        return normalizeLyricsRecord(directRecord, duration, "LRCLIB");
      }
    } catch (e) {
      // Fall through to search
    }
  }

  // 2. Try SEARCH endpoint
  try {
    const q = mainToken ? `${mainToken} ${title}` : title;
    const searchRes = await requestLRCLIB("/search", { q }, signal);
    const records = Array.isArray(searchRes) ? searchRes : searchRes ? [searchRes] : [];
    
    const validRecords = records.filter(r => r && (r.syncedLyrics || r.plainLyrics));
    if (validRecords.length > 0) {
        // Sort by duration match
        validRecords.sort((a, b) => {
            const diffA = Math.abs((a.duration || 0) - duration);
            const diffB = Math.abs((b.duration || 0) - duration);
            return diffA - diffB;
        });
        return normalizeLyricsRecord(validRecords[0], duration, "LRCLIB");
    }
  } catch (e) {
    console.warn("LRCLIB Search failed", e);
  }
  
  return null;
}

// ------------------------------------------------
// Netease Fetcher
// ------------------------------------------------
async function fetchFromNetease(title, artist, duration, signal) {
  if (!title) return null;
  const q = artist ? `${artist} ${title}` : title;

  for (const proxy of NETEASE_PROXIES) {
    try {
      // Search track
      const searchUrl = `${proxy}/search?keywords=${encodeURIComponent(q)}&type=1&limit=5`;
      const searchRes = await fetch(searchUrl, { signal }).then(r => r.json());
      const songs = searchRes?.result?.songs || [];
      if (!songs.length) continue;

      // Filter by duration if available, else pick first
      let bestSong = songs[0];
      if (duration > 0) {
        let bestDiff = 999999;
        for (const s of songs) {
            // Netease duration is usually in ms
            const sDur = s.dt ? s.dt / 1000 : (s.duration ? s.duration / 1000 : 0);
            const diff = Math.abs(sDur - duration);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestSong = s;
            }
        }
      }

      const songId = bestSong.id;
      
      // Fetch lyric
      const lyricUrl = `${proxy}/lyric?id=${songId}`;
      const lyricRes = await fetch(lyricUrl, { signal }).then(r => r.json());
      
      const syncedLyrics = lyricRes?.lrc?.lyric || "";
      if (syncedLyrics && !syncedLyrics.includes("Pure music")) {
         return normalizeLyricsRecord({
             id: songId,
             syncedLyrics: syncedLyrics,
             plainLyrics: "",
             trackName: bestSong.name,
             artistName: bestSong.artists?.[0]?.name || artist,
             duration: bestSong.dt ? bestSong.dt / 1000 : duration
         }, duration, "NetEase");
      }
    } catch (e) {
      console.warn(`NetEase fetch failed for proxy ${proxy}`, e);
    }
  }
  return null;
}

// ------------------------------------------------
// Main Aggregator Fetch
// ------------------------------------------------
export async function fetchLyricsForTrack(track, signal) {
  const signature = getLyricsSignature(track);
  const duration = Math.round(track?.duration || signature.duration || 0);
  const title = signature.trackName;
  const artist = signature.fullArtistName;

  if (!title) {
    return { status: "empty", source: "LRCLIB", lines: [] };
  }

  // 1. Try Netease (often has perfect synced lyrics for everything)
  const neteaseResult = await fetchFromNetease(title, artist, duration, signal);
  if (neteaseResult && neteaseResult.status === "synced") {
      console.log("[Lyrics Aggregator] Found synced lyrics on NetEase");
      return neteaseResult;
  }

  // 2. Fallback to LRCLIB (has massive database, but sometimes missing niche synced)
  const lrclibResult = await fetchFromLRCLIB(title, artist, duration, signature, signal);
  if (lrclibResult && lrclibResult.status !== "empty") {
      console.log(`[Lyrics Aggregator] Found ${lrclibResult.status} lyrics on LRCLIB`);
      return lrclibResult;
  }

  // 3. Return best available or empty
  if (neteaseResult && neteaseResult.status !== "empty") return neteaseResult;
  
  return { status: "empty", source: "Aggregator", lines: [] };
}

// ------------------------------------------------
// Utilities & Caching
// ------------------------------------------------
export function getActiveLyricIndex(lines, currentTime) {
  if (!lines || !lines.length) return -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(lines[index].time) && currentTime + 0.08 >= lines[index].time) {
      return index;
    }
  }
  return -1;
}

const lyricsRequestCache = new Map();

export function getLyricsCacheKey(track) {
  if (!track) return "";
  const idStr = track.id ? String(track.id) : "";
  const normTitle = normalizeComparable(track.title || "");
  const normArtist = normalizeComparable(track.artist || "");
  return [idStr, normTitle, normArtist].filter(Boolean).join("|");
}

function loadLyricsFromLocalStorage(key) {
    if (typeof window === "undefined") return null;
    try {
        const cached = localStorage.getItem(`amymusic_lyrics_${key}`);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.lines) return parsed;
        }
    } catch (e) {
        console.error("Failed to load lyrics from local storage", e);
    }
    return null;
}

function saveLyricsToLocalStorage(key, lyricsObj) {
    if (typeof window === "undefined" || !lyricsObj || lyricsObj.status === "error") return;
    try {
        localStorage.setItem(`amymusic_lyrics_${key}`, JSON.stringify(lyricsObj));
    } catch (e) {
        console.error("Failed to save lyrics to local storage", e);
    }
}

export function getCachedLyricsForTrack(track, duration, signal) {
  if (!track || !track.id || track.id === "empty") {
    return Promise.resolve({ status: "empty", lines: [], error: "" });
  }

  const key = getLyricsCacheKey(track);

  // 1. Check RAM Cache
  if (lyricsRequestCache.has(key)) {
    return lyricsRequestCache.get(key);
  }

  // 2. Check Disk Cache (LocalStorage)
  const diskCached = loadLyricsFromLocalStorage(key);
  if (diskCached && diskCached.status !== "empty") {
      const diskPromise = Promise.resolve(diskCached);
      lyricsRequestCache.set(key, diskPromise);
      return diskPromise;
  }

  // 3. Fetch from Network
  const request = fetchLyricsForTrack(
    {
      ...track,
      duration: track.duration || duration
    },
    signal
  )
    .then((lyrics) => {
      const result = {
        status: lyrics.status,
        lines: lyrics.lines || [],
        source: lyrics.source,
        error: ""
      };

      if (lyrics.status !== "synced" && lyrics.status !== "plain" && lyrics.status !== "instrumental") {
        lyricsRequestCache.delete(key);
      } else {
        saveLyricsToLocalStorage(key, result);
      }

      return result;
    })
    .catch((error) => {
      lyricsRequestCache.delete(key);
      return {
        status: "error",
        lines: [],
        error: error.message || "Failed to fetch lyrics"
      };
    });

  lyricsRequestCache.set(key, request);
  return request;
}
