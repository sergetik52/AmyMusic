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
    lines: syncedLines.length ? syncedLines : plainLines,
    annotations: record.annotations || {}
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
    headers: {
      "LrcLib-Client": "Amymusic (https://github.com/sergetik52/AmyMusic)"
    },
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
        validRecords.sort((a, b) => {
            // Prioritize exact title matches (check both original and cleaned)
            const candidates = signature.titleCandidates.map(c => c.toLowerCase());
            const aTitle = (a.trackName || a.name || "").toLowerCase();
            const bTitle = (b.trackName || b.name || "").toLowerCase();
            
            const aExact = candidates.includes(aTitle);
            const bExact = candidates.includes(bTitle);

            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            // Then sort by duration match
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
        songs.sort((a, b) => {
            const originalTitleLower = (title || "").toLowerCase();
            const aTitleMatch = (a.name || "").toLowerCase() === originalTitleLower;
            const bTitleMatch = (b.name || "").toLowerCase() === originalTitleLower;
            
            if (aTitleMatch && !bTitleMatch) return -1;
            if (!aTitleMatch && bTitleMatch) return 1;

            const aDur = a.dt ? a.dt / 1000 : (a.duration ? a.duration / 1000 : 0);
            const bDur = b.dt ? b.dt / 1000 : (b.duration ? b.duration / 1000 : 0);
            return Math.abs(aDur - duration) - Math.abs(bDur - duration);
        });
        bestSong = songs[0];
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
// Genius Fetcher
// ------------------------------------------------
export function getGeniusApiBase() {
  if (typeof window === "undefined") return "https://genius.com";
  if (window.Capacitor?.isNativePlatform?.() || window.location?.protocol === "capacitor:") {
    return "https://genius.com";
  }
  const proxyPort = new URLSearchParams(window.location.search).get("amymusicProxyPort");
  return (proxyPort ? `http://127.0.0.1:${proxyPort}/proxy/genius` : "") || "/proxy/genius";
}

async function fetchFromGenius(title, signature, duration, signal) {
  if (!title) return null;
  const mainToken = signature.searchArtistToken || signature.fullArtistName;
  const q = mainToken ? `${mainToken} ${title}` : title;
  
  try {
    const baseUrl = getGeniusApiBase();
    const searchUrl = `${baseUrl}/api/search/multi?per_page=5&q=${encodeURIComponent(q)}`;
    const searchRes = await fetch(searchUrl, { signal }).then(r => r.json());
    
    const songSection = searchRes?.response?.sections?.find(s => s.type === "song");
    const hits = songSection?.hits || [];
    if (!hits.length) return null;
    
    const bestHit = hits[0];
    const geniusUrl = bestHit.result?.url;
    const songId = bestHit.result?.id;
    if (!geniusUrl) return null;
    
    // Replace genius.com with our proxy base
    const proxiedUrl = geniusUrl.replace(/^https?:\/\/genius\.com/, baseUrl);
    const html = await fetch(proxiedUrl, { signal }).then(r => r.text());

    // Parse HTML properly since regex fails on nested tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const containerNodes = doc.querySelectorAll('[data-lyrics-container="true"]');
    
    if (!containerNodes || !containerNodes.length) return null;
    
    // Collect annotation IDs from <a> href links
    const annotationIds = new Set();
    
    let plainLyrics = Array.from(containerNodes).map(node => {
        // Remove junk elements like '122 Contributors'
        node.querySelectorAll('[data-exclude-from-selection="true"]').forEach(el => el.remove());
        
        // Preserve annotations by replacing <a> tags with custom <annotation> tags
        node.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            const match = href && href.match(/^\/([0-9]+)\//);
            if (match) {
                const id = match[1];
                annotationIds.add(id);
                let innerHtml = a.innerHTML;
                // If annotation spans across <br>, split the annotation so it remains valid per-line
                innerHtml = innerHtml.replace(/<br\s*\/?>/gi, `</annotation><br><annotation id="${id}">`);
                a.outerHTML = `<annotation id="${id}">${innerHtml}</annotation>`;
            }
        });
        
        let inner = node.innerHTML;
        // Remove literal formatting newlines from HTML before converting <br>
        inner = inner.replace(/\r?\n/g, '');
        // Convert <br> to newline
        inner = inner.replace(/<br\s*\/?>/gi, '\n');
        // Strip remaining HTML tags EXCEPT <annotation>
        inner = inner.replace(/<(?!\/?annotation\b)[^>]+>/gi, '');
        return inner;
    }).join('\n');
      
    plainLyrics = plainLyrics
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&[a-z]+;/g, ''); // catch any other remaining entities just in case

    // Fetch annotations content via /api/referents
    let annotations = {};
    if (songId && annotationIds.size > 0) {
      try {
        const refUrl = `${baseUrl}/api/referents?song_id=${songId}&per_page=50&text_format=html`;
        const refRes = await fetch(refUrl, { signal }).then(r => r.json());
        const referents = refRes?.response?.referents || [];
        for (const ref of referents) {
          const refId = String(ref.id);
          if (ref.annotations && ref.annotations.length > 0) {
            const ann = ref.annotations[0];
            let bodyHtml = ann.body?.html || "";
            // Strip HTML tags from annotation body, keep just text with line breaks
            bodyHtml = bodyHtml.replace(/<br\s*\/?>/gi, '\n');
            bodyHtml = bodyHtml.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
            bodyHtml = bodyHtml.replace(/<[^>]+>/g, '');
            bodyHtml = bodyHtml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
            bodyHtml = bodyHtml.replace(/\n{2,}/g, '\n').trim();
            if (bodyHtml) {
              annotations[refId] = bodyHtml;
            }
          }
        }
        console.log(`[Lyrics] Fetched ${Object.keys(annotations).length} Genius annotations`);
      } catch (annErr) {
        console.warn("Failed to fetch Genius annotations", annErr);
      }
    }

    return normalizeLyricsRecord({
      id: `genius_${bestHit.result.id}`,
      syncedLyrics: "",
      plainLyrics,
      trackName: bestHit.result.title,
      artistName: bestHit.result.primary_artist?.name || artist,
      duration: duration,
      annotations
    }, duration, "Genius");
    
  } catch (e) {
    console.warn("Genius fetch failed", e);
    return null;
  }
}

// ------------------------------------------------
// Main Aggregator Fetch
// ------------------------------------------------
export async function fetchLyricsForTrack(track, signal, preferredSource = "auto") {
  const signature = getLyricsSignature(track);
  const duration = Math.round(track?.duration || signature.duration || 0);
  const title = signature.trackName;
  const artist = signature.fullArtistName;

  if (!title) {
    return { status: "empty", source: "LRCLIB", lines: [] };
  }

  if (preferredSource === "genius") {
    const geniusResult = await fetchFromGenius(title, signature, duration, signal);
    if (geniusResult && geniusResult.status !== "empty") {
      console.log(`[Lyrics Aggregator] Found plain lyrics on Genius (requested Genius)`);
      return geniusResult;
    }
    return { status: "empty", source: "Genius", lines: [] };
  } else if (preferredSource === "karaoke") {
    const neteaseResult = await fetchFromNetease(title, artist, duration, signal);
    if (neteaseResult && neteaseResult.status === "synced") {
      console.log("[Lyrics Aggregator] Found synced lyrics on NetEase (requested Karaoke)");
      return neteaseResult;
    }
    const lrclibResult = await fetchFromLRCLIB(title, artist, duration, signature, signal);
    if (lrclibResult && lrclibResult.status === "synced") {
      console.log(`[Lyrics Aggregator] Found synced lyrics on LRCLIB (requested Karaoke)`);
      return lrclibResult;
    }
    return { status: "empty", source: "Karaoke", lines: [] };
  }

  // Auto behavior or fallback if requested source not found
  const neteaseResult = await fetchFromNetease(title, artist, duration, signal);
  if (neteaseResult && neteaseResult.status === "synced") {
      console.log("[Lyrics Aggregator] Found synced lyrics on NetEase");
      return neteaseResult;
  }

  const lrclibResult = await fetchFromLRCLIB(title, artist, duration, signature, signal);
  if (lrclibResult && lrclibResult.status === "synced") {
      console.log(`[Lyrics Aggregator] Found synced lyrics on LRCLIB`);
      return lrclibResult;
  }

  const geniusResult = await fetchFromGenius(title, signature, duration, signal);
  if (geniusResult && geniusResult.status !== "empty") {
      console.log(`[Lyrics Aggregator] Found plain lyrics on Genius`);
      return geniusResult;
  }

  if (lrclibResult && lrclibResult.status !== "empty") {
      console.log(`[Lyrics Aggregator] Found plain lyrics on LRCLIB`);
      return lrclibResult;
  }
  
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

export function getLyricsCacheKey(track, preferredSource = "auto") {
  if (!track) return "";
  const idStr = track.id ? String(track.id) : "";
  const normTitle = normalizeComparable(track.title || "");
  const normArtist = normalizeComparable(track.artist || "");
  return [idStr, normTitle, normArtist, preferredSource].filter(Boolean).join("|");
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

export function clearLyricsCacheForTrack(track, preferredSource = "auto") {
  if (!track) return;
  const key = getLyricsCacheKey(track, preferredSource);
  lyricsRequestCache.delete(key);
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(`amymusic_lyrics_${key}`);
    } catch (e) {}
  }
}

export function getCachedLyricsForTrack(track, duration, signal, preferredSource = "auto") {
  if (!track || !track.id || track.id === "empty") {
    return Promise.resolve({ status: "empty", lines: [], error: "" });
  }

  const key = getLyricsCacheKey(track, preferredSource);

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
    signal,
    preferredSource
  )
    .then((lyrics) => {
      const result = {
        status: lyrics.status,
        lines: lyrics.lines || [],
        source: lyrics.source,
        annotations: lyrics.annotations || {},
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
