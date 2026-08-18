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
  if (!normalized || normalized.length < 2) return;
  if (!list.some((item) => normalizeComparable(item) === normalizeComparable(normalized))) {
    list.push(normalized);
  }
}

function splitArtistCandidates(value = "") {
  return cleanText(value)
    .split(/\s*(?:,|&|\/|\+|\bx\b|\bX\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|;)\s*/i)
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

  const featureMatch = cleaned.match(/\b(?:feat\.?|ft\.?|featuring|with)\b/i);
  if (featureMatch?.index > 0) {
    return {
      title: cleaned.slice(0, featureMatch.index),
      features: cleaned.slice(featureMatch.index + featureMatch[0].length)
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

  const featureMatches = source.matchAll(/\b(?:feat\.?|ft\.?|featuring|with)\s+([^\)\]\-–—]+)/gi);
  for (const match of featureMatches) {
    splitArtistCandidates(match[1]).forEach((artist) => addUnique(artists, artist));
  }

  splitArtistCandidates(splitTrailingFeatureBlock(source).features).forEach((artist) => addUnique(artists, artist));

  return artists;
}

function getTitleCandidates(rawTitle = "") {
  const titles = [];
  const cleaned = cleanText(rawTitle);
  const dashMatch = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);

  if (dashMatch) {
    addUnique(titles, dashMatch[2]);
    addUnique(titles, splitTrailingFeatureBlock(dashMatch[2]).title);
  }

  addUnique(titles, cleaned);
  addUnique(titles, splitTrailingFeatureBlock(cleaned).title);
  addUnique(titles, cleaned.replace(/\b(?:feat\.?|ft\.?|featuring|with)\b.+$/i, ""));
  addUnique(titles, stripAllBrackets(cleaned));

  return titles;
}

function getLyricsSignature(track) {
  const rawTitle = track?.title || "";
  const rawArtist = track?.artist || "";
  const titleCandidates = getTitleCandidates(rawTitle);
  const artistCandidates = [];

  extractArtistsFromTitle(rawTitle).forEach((artist) => addUnique(artistCandidates, artist));
  splitArtistCandidates(rawArtist).forEach((artist) => addUnique(artistCandidates, artist));
  addUnique(artistCandidates, rawArtist);

  const fallbackTitle = cleanText(rawTitle) || "Unknown track";
  const fallbackArtist = cleanText(rawArtist) || "Unknown artist";

  return {
    trackName: titleCandidates[0] || fallbackTitle,
    artistName: artistCandidates[0] || fallbackArtist,
    titleCandidates: titleCandidates.length ? titleCandidates : [fallbackTitle],
    artistCandidates: artistCandidates.length ? artistCandidates : [fallbackArtist],
    queryCandidates: [
      ...artistCandidates.flatMap((artist) => titleCandidates.map((title) => `${artist} ${title}`)),
      ...titleCandidates,
      cleanText(rawTitle)
    ].filter(Boolean),
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

  const response = await fetch(url, {
    signal,
    headers: {
      "Accept": "application/json",
      "Lrclib-Client": CLIENT_HEADER,
      "X-User-Agent": CLIENT_HEADER
    }
  });

  const body = await response.text();
  logDebug("lyrics", `${scope}: response`, {
    status: response.status,
    ok: response.ok
  });

  if (!response.ok) {
    throw new Error(`LRCLIB request failed: ${response.status}`);
  }

  return JSON.parse(body);
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
  if (durationDiff <= 2) score += 25;
  else if (durationDiff <= 8) score += 10;
  else if (durationDiff >= 45) score -= 16;

  return score - Math.min(durationDiff, 60);
}

function buildExactPlans(signature) {
  const plans = [];
  signature.titleCandidates.slice(0, 5).forEach((trackName) => {
    signature.artistCandidates.slice(0, 6).forEach((artistName) => {
      plans.push({ trackName, artistName });
    });
  });
  return plans.slice(0, 24);
}

function buildSearchPlans(signature) {
  const plans = [];
  signature.titleCandidates.slice(0, 6).forEach((trackName) => {
    signature.artistCandidates.slice(0, 7).forEach((artistName) => {
      plans.push({ trackName, artistName });
    });
    plans.push({ trackName, artistName: "" });
  });

  signature.queryCandidates.slice(0, 12).forEach((query) => {
    plans.push({ query });
  });

  const seen = new Set();
  return plans.filter((plan) => {
    const key = JSON.stringify(plan);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 48);
}

export async function fetchLyricsForTrack(track, signal) {
  const signature = getLyricsSignature(track);

  logDebug("lyrics", "signature candidates", {
    titles: signature.titleCandidates,
    artists: signature.artistCandidates,
    queries: signature.queryCandidates.slice(0, 8),
    duration: signature.duration
  });

  for (const plan of buildExactPlans(signature)) {
    try {
      const exactUrl = toLyricsUrl("/get", {
        track_name: plan.trackName,
        artist_name: plan.artistName,
        duration: signature.duration || undefined
      });
      const exact = await requestLyrics(exactUrl, `get:${plan.artistName}:${plan.trackName}`, signal);
      return normalizeLyricsRecord(exact, signature.duration);
    } catch (error) {
      logWarn("lyrics", `get failed for ${plan.artistName} - ${plan.trackName}`, error);
    }
  }

  const allResults = [];
  for (const plan of buildSearchPlans(signature)) {
    try {
      const searchUrl = plan.query
        ? toLyricsUrl("/search", { q: plan.query })
        : toLyricsUrl("/search", {
            track_name: plan.trackName,
            artist_name: plan.artistName || undefined
          });
      const scope = plan.query ? `search:q:${plan.query}` : `search:${plan.artistName}:${plan.trackName}`;
      const results = await requestLyrics(searchUrl, scope, signal);
      if (Array.isArray(results)) {
        allResults.push(...results);
      } else if (results) {
        allResults.push(results);
      }
    } catch (error) {
      logWarn("lyrics", `search failed for ${plan.query || `${plan.artistName} - ${plan.trackName}`}`, error);
    }
  }

  const byId = new Map();
  allResults.forEach((record) => byId.set(record.id || `${record.artistName}:${record.trackName}`, record));
  const best = [...byId.values()]
    .sort((a, b) => scoreLyricsMatch(b, signature) - scoreLyricsMatch(a, signature))
    .find((record) => record.syncedLyrics || record.plainLyrics || record.instrumental);

  if (!best) {
    return { status: "empty", source: "LRCLIB", lines: [] };
  }

  return normalizeLyricsRecord(best, signature.duration);
}
