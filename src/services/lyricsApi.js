import { logDebug, logWarn } from "../utils/logger";

const LRCLIB_API_BASE = "https://lrclib.net/api";
const CLIENT_HEADER = "AmyMusic/0.1.0 (a657eo@icloud.com)";

function cleanText(value = "") {
  return value
    .replace(/\s*\[[^\]]*]/g, "")
    .replace(/\s*\([^)]*(official|audio|video|lyrics|visualizer|remix|sped up|slowed|prod\.?|producer|nightcore|reverb|edit|version|clip)[^)]*\)/gi, "")
    .replace(/\s*\b(prod\.?|producer)\s+[^-–—|]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAllBrackets(value = "") {
  return cleanText(value)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value = "") {
  return stripAllBrackets(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addUnique(list, value) {
  const normalized = cleanText(value);
  if (!normalized || normalized.length < 1) return;
  if (!list.some((item) => normalizeComparable(item) === normalizeComparable(normalized))) {
    list.push(normalized);
  }
}

function splitArtistCandidates(value = "") {
  if (!value) return [];
  return cleanText(value)
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bX\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|при\s+уч(?:\.|астии)?|\bуч\.?|;)\s*/i)
    .map(cleanText)
    .filter((item) => item.length >= 2 && item.length <= 64);
}

function splitTrailingFeatureBlock(value = "") {
  const cleaned = cleanText(value);
  const plusIndex = cleaned.search(/\s*\+\s*\S/);
  if (plusIndex > 0) {
    const plusPrefix = cleaned.slice(plusIndex).match(/^\s*\+\s*/)?.[0] || "+";
    return {
      title: cleaned.slice(0, plusIndex),
      features: cleaned.slice(plusIndex + plusPrefix.length)
    };
  }

  const featureMatch = cleaned.match(/(?:feat\.?|ft\.?|featuring|with|при\s+уч(?:\.|астии)?|\bуч\.?)\s+(.+)$/i);
  if (featureMatch && featureMatch.index > 0) {
    return {
      title: cleaned.slice(0, featureMatch.index).trim(),
      features: featureMatch[1].trim()
    };
  }

  return { title: cleaned, features: "" };
}

function extractArtistsFromTitle(rawTitle = "") {
  const artists = [];
  const source = String(rawTitle || "");
  const dashMatch = source.match(/^(.+?)\s+[-–—]\s+(.+)$/);

  if (dashMatch) {
    splitArtistCandidates(dashMatch[1]).forEach((artist) => addUnique(artists, artist));
    splitArtistCandidates(splitTrailingFeatureBlock(dashMatch[2]).features).forEach((artist) => addUnique(artists, artist));
  }

  const featureMatches = source.matchAll(/(?:feat\.?|ft\.?|featuring|with|при\s+уч(?:\.|астии)?|\bуч\.?)\s+([^\)\]\-–—]+)/gi);
  for (const match of featureMatches) {
    splitArtistCandidates(match[1]).forEach((artist) => addUnique(artists, artist));
  }

  splitArtistCandidates(splitTrailingFeatureBlock(source).features).forEach((artist) => addUnique(artists, artist));

  return artists;
}

function generateTitleVariants(rawTitle = "") {
  const titles = [];
  let source = String(rawTitle || "");

  if (source.includes("_")) {
    source = source.replace(/_/g, " ");
  }

  // Remove leading artist prefix if in format "Kai Angel flowers" or "Kai Angel - flowers"
  source = source.replace(/^[A-Za-z0-9\s]+[-–—]\s*/, "");
  source = source.replace(/^[A-Za-z0-9_]+_(?=[A-Za-z0-9])/g, "");

  const dashMatch = source.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const trackTitle = dashMatch ? dashMatch[2] : source;

  addUnique(titles, trackTitle);
  addUnique(titles, splitTrailingFeatureBlock(trackTitle).title);

  const cleaned = cleanText(trackTitle);
  addUnique(titles, cleaned);
  addUnique(titles, cleaned.replace(/\s*[\(\[](?:feat\.?|ft\.?|featuring|with|при\s+уч(?:\.|астии)?|\bуч\.?).*?[\)\]]/gi, "").trim());
  addUnique(titles, cleaned.replace(/\s+(?:feat\.?|ft\.?|featuring|with|при\s+уч(?:\.|астии)?|\bуч\.?).*$/gi, "").trim());
  addUnique(titles, stripAllBrackets(cleaned));

  return titles;
}

function getSearchArtistToken(artistName = "") {
  const words = artistName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return artistName;
  const genericPrefixes = new Set(["the", "a", "an", "dj", "mc", "lil", "big", "young", "mr", "dr"]);
  if (words.length >= 2 && genericPrefixes.has(words[0].toLowerCase())) {
    return `${words[0]} ${words[1]}`;
  }
  return words[0];
}

function getLyricsSignature(track) {
  const rawTitle = track?.title || "";
  const rawArtist = track?.artist || "";
  const titleCandidates = generateTitleVariants(rawTitle);

  const artistCandidates = [];
  const fullArtistCandidates = [];

  extractArtistsFromTitle(rawTitle).forEach((artist) => {
    addUnique(fullArtistCandidates, artist);
    addUnique(artistCandidates, artist);
    artist.split(/\s+/).forEach((w) => {
      if (w.length >= 2) addUnique(artistCandidates, w);
    });
  });

  splitArtistCandidates(rawArtist).forEach((artist) => {
    addUnique(fullArtistCandidates, artist);
    addUnique(artistCandidates, artist);
    artist.split(/\s+/).forEach((w) => {
      if (w.length >= 2) addUnique(artistCandidates, w);
    });
  });

  if (rawArtist) {
    addUnique(fullArtistCandidates, rawArtist);
    addUnique(artistCandidates, rawArtist);
    rawArtist.split(/\s+/).forEach((w) => {
      if (w.length >= 2) addUnique(artistCandidates, w);
    });
  }

  const fallbackTitle = cleanText(rawTitle) || "Unknown track";
  const fallbackArtist = cleanText(rawArtist) || "Unknown artist";

  const primaryArtist = fullArtistCandidates[0] || fallbackArtist;
  const primaryTitle = titleCandidates[0] || fallbackTitle;
  const searchArtistToken = getSearchArtistToken(primaryArtist);

  const queryCandidates = [];
  addUnique(queryCandidates, `${primaryArtist} ${primaryTitle}`);
  if (searchArtistToken !== primaryArtist) {
    addUnique(queryCandidates, `${searchArtistToken} ${primaryTitle}`);
  }
  addUnique(queryCandidates, primaryTitle);

  if (track?.album) {
    addUnique(queryCandidates, `${primaryArtist} ${track.album}`);
    if (searchArtistToken !== primaryArtist) {
      addUnique(queryCandidates, `${searchArtistToken} ${track.album}`);
    }
  }

  return {
    trackName: primaryTitle,
    artistName: primaryArtist,
    searchArtistToken,
    fullArtistName: primaryArtist,
    titleCandidates: titleCandidates.length ? titleCandidates : [fallbackTitle],
    artistCandidates: artistCandidates.length ? artistCandidates : [fallbackArtist],
    fullArtistCandidates: fullArtistCandidates.length ? fullArtistCandidates : [fallbackArtist],
    queryCandidates,
    duration: Math.round(track?.duration || 0)
  };
}

function toLyricsUrl(path, params) {
  const url = new URL(`${LRCLIB_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function requestLyrics(url, scope, signal) {
  logDebug("lyrics", `${scope}: request`, { url: url.toString() });

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 2500);

  let requestSignal = timeoutController.signal;
  if (signal) {
    if (typeof AbortSignal.any === "function") {
      requestSignal = AbortSignal.any([signal, timeoutController.signal]);
    } else {
      signal.addEventListener("abort", () => timeoutController.abort());
      if (signal.aborted) timeoutController.abort();
    }
  }

  try {
    const response = await fetch(url, {
      signal: requestSignal,
      headers: {
        "Accept": "application/json",
        "Lrclib-Client": CLIENT_HEADER,
        "X-User-Agent": CLIENT_HEADER
      }
    });

    if (!response.ok) {
      throw new Error(`LRCLIB request failed: ${response.status}`);
    }

    const body = await response.text();
    logDebug("lyrics", `${scope}: response`, {
      status: response.status,
      ok: response.ok
    });

    return JSON.parse(body);
  } catch (err) {
    if (err?.name === "AbortError") {
      logDebug("lyrics", `${scope}: cancelled / aborted`);
    } else {
      logWarn("lyrics", `${scope}: request failed`, err);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function timestampToSeconds(value) {
  const match = value.match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = Number((match[3] || "0").padEnd(3, "0")) / 1000;
  return minutes * 60 + seconds + fraction;
}

export function parseSyncedLyrics(syncedLyrics = "") {
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

function normalizeLyricsRecord(record, requestedDuration = 0) {
  if (!record || record.instrumental) {
    return {
      status: record?.instrumental ? "instrumental" : "empty",
      source: "LRCLIB",
      lines: []
    };
  }

  const syncedLines = parseSyncedLyrics(record.syncedLyrics || "");
  const plainLines = parsePlainLyrics(record.plainLyrics || "", requestedDuration || record.duration || 0);

  return {
    status: syncedLines.length ? "synced" : plainLines.length ? "plain" : "empty",
    source: "LRCLIB",
    id: record.id,
    trackName: record.trackName || record.name,
    artistName: record.artistName,
    albumName: record.albumName,
    lines: syncedLines.length ? syncedLines : plainLines
  };
}

function scoreTextMatch(actualValue, wantedValues, exactScore, containsScore) {
  const actual = normalizeComparable(actualValue);
  if (!actual) return 0;

  return wantedValues.reduce((best, wantedValue) => {
    const wanted = normalizeComparable(wantedValue);
    if (!wanted) return best;
    if (actual === wanted) return Math.max(best, exactScore);
    if (actual.includes(wanted) || wanted.includes(actual)) return Math.max(best, containsScore);
    return best;
  }, 0);
}

function scoreLyricsMatch(record, signature) {
  const durationDiff =
    record.duration && signature.duration
      ? Math.abs(Number(record.duration) - signature.duration)
      : 999;

  let score = 0;
  score += scoreTextMatch(record.trackName || record.name || "", signature.titleCandidates, 72, 34);
  score += scoreTextMatch(record.artistName || "", signature.artistCandidates, 34, 16);

  const normRecordArtist = normalizeComparable(record.artistName || "");
  const normFullArtist = normalizeComparable(signature.fullArtistName || "");
  if (normRecordArtist && normFullArtist && normRecordArtist === normFullArtist) {
    score += 40;
  }

  if (durationDiff <= 2) score += 25;
  else if (durationDiff <= 8) score += 10;
  else if (durationDiff >= 45) score -= 16;

  return score - Math.min(durationDiff, 60);
}

export async function fetchLyricsForTrack(track, signal) {
  const signature = getLyricsSignature(track);
  const duration = Math.round(track?.duration || signature.duration || 0);

  logDebug("lyrics", "signature candidates", {
    titles: signature.titleCandidates,
    artists: signature.artistCandidates,
    queries: signature.queryCandidates,
    duration
  });

  const promises = [];

  const title = signature.trackName;
  const fullArtist = signature.fullArtistName;
  const searchArtistToken = signature.searchArtistToken;

  // Send high-precision search requests concurrently in parallel (ZERO sequential loops!)
  if (title) {
    if (fullArtist) {
      promises.push(
        requestLyrics(toLyricsUrl("/search", { track_name: title, artist_name: fullArtist }), `search:${fullArtist}:${title}`, signal)
          .then((res) => (Array.isArray(res) ? res : res ? [res] : []))
          .catch(() => [])
      );
    }

    if (searchArtistToken && searchArtistToken !== fullArtist) {
      promises.push(
        requestLyrics(toLyricsUrl("/search", { track_name: title, artist_name: searchArtistToken }), `search:${searchArtistToken}:${title}`, signal)
          .then((res) => (Array.isArray(res) ? res : res ? [res] : []))
          .catch(() => [])
      );
    }

    promises.push(
      requestLyrics(toLyricsUrl("/search", { q: `${searchArtistToken || fullArtist} ${title}` }), `search:q:${title}`, signal)
        .then((res) => (Array.isArray(res) ? res : res ? [res] : []))
        .catch(() => [])
    );
  }

  // Execute ALL candidate requests concurrently in parallel
  const results = await Promise.allSettled(promises);
  const allRecords = [];

  results.forEach((res) => {
    if (res.status === "fulfilled" && res.value) {
      if (Array.isArray(res.value)) {
        allRecords.push(...res.value);
      } else {
        allRecords.push(res.value);
      }
    }
  });

  let validRecords = allRecords.filter((r) => r && (r.syncedLyrics || r.plainLyrics || r.instrumental));

  // Fallback: search by title only if no records found
  if (!validRecords.length && title && !signal?.aborted) {
    try {
      const titleOnlyRes = await requestLyrics(toLyricsUrl("/search", { q: title }), `search:fallback:${title}`, signal);
      const items = Array.isArray(titleOnlyRes) ? titleOnlyRes : titleOnlyRes ? [titleOnlyRes] : [];
      validRecords = items.filter((r) => r && (r.syncedLyrics || r.plainLyrics || r.instrumental));
    } catch (e) {
      // ignore fallback error
    }
  }

  if (!validRecords.length) {
    return { status: "empty", source: "LRCLIB", lines: [] };
  }

  const byId = new Map();
  validRecords.forEach((record) => {
    const key = record.id || `${record.artistName}:${record.trackName}`;
    if (!byId.has(key)) byId.set(key, record);
  });

  const best = [...byId.values()]
    .sort((a, b) => scoreLyricsMatch(b, signature) - scoreLyricsMatch(a, signature))[0];

  if (!best) {
    return { status: "empty", source: "LRCLIB", lines: [] };
  }

  return normalizeLyricsRecord(best, duration);
}

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
let activeLyricsAbortController = null;
let activeLyricsKey = null;

export function cancelPendingLyricsFetch() {
  if (activeLyricsAbortController) {
    activeLyricsAbortController.abort();
    activeLyricsAbortController = null;
  }
}

export function getLyricsCacheKey(track, duration) {
  return [
    track?.id || "",
    track?.title || "",
    track?.artist || "",
    Math.round(track?.duration || duration || 0)
  ].join("|");
}

export function getCachedLyricsForTrack(track, duration, signal) {
  if (!track || !track.id || track.id === "empty") {
    return Promise.resolve({ status: "empty", lines: [], error: "" });
  }

  const key = getLyricsCacheKey(track, duration);

  // If already cached, return cached promise immediately!
  if (lyricsRequestCache.has(key)) {
    return lyricsRequestCache.get(key);
  }

  // Cancel any in-flight lyrics fetch for a previous track (skip track priority!)
  if (activeLyricsKey !== key) {
    cancelPendingLyricsFetch();
    activeLyricsKey = key;
    activeLyricsAbortController = new AbortController();
  }

  const currentController = activeLyricsAbortController;

  let combinedSignal = currentController ? currentController.signal : null;
  if (signal && currentController) {
    if (typeof AbortSignal.any === "function") {
      combinedSignal = AbortSignal.any([signal, currentController.signal]);
    } else {
      signal.addEventListener("abort", () => currentController.abort());
      if (signal.aborted) currentController.abort();
    }
  } else if (signal) {
    combinedSignal = signal;
  }

  const request = fetchLyricsForTrack(
    {
      ...track,
      duration: track.duration || duration
    },
    combinedSignal
  )
    .then((lyrics) => ({
      status: lyrics.status,
      lines: lyrics.lines || [],
      error: ""
    }))
    .catch((error) => {
      // If aborted because track was skipped, clear from cache so it can be re-fetched later if user returns
      if (error?.name === "AbortError" || currentController?.signal?.aborted) {
        lyricsRequestCache.delete(key);
        return { status: "loading", lines: [], error: "" };
      }
      return {
        status: "error",
        lines: [],
        error: error.message || "Не удалось загрузить текст"
      };
    });

  lyricsRequestCache.set(key, request);
  return request;
}
