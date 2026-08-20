
const yandexArtistAvatarMap = new Map();

export function getYandexCachedArtistAvatar(artistName = "") {
  if (!artistName) return "";
  const key = String(artistName).toLowerCase().trim();
  return yandexArtistAvatarMap.get(key) || "";
}

export async function fetchYandexArtistAvatar(artistName = "") {
  if (!artistName) return "";
  const key = String(artistName).toLowerCase().trim();
  if (yandexArtistAvatarMap.has(key)) return yandexArtistAvatarMap.get(key);

  try {
    const data = await fetchYandexApi(`/search?text=${encodeURIComponent(artistName)}&type=all&page=0`);
    const artists = data?.artists?.results || [];
    if (artists.length > 0) {
      const exact = artists.find((a) => (a.name || "").toLowerCase().trim() === key) || artists[0];
      if (exact?.cover?.uri) {
        const avatarUrl = `https://${exact.cover.uri.replace("%%", "400x400")}`;
        yandexArtistAvatarMap.set(key, avatarUrl);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("amymusic:artist-avatar-updated", { detail: { name: artistName, avatar: avatarUrl } }));
        }
        return avatarUrl;
      }
    }
  } catch (err) {
    // Fallback search silently
  }
  return "";
}


// Pure JS MD5 implementation for client-side stream URL hashing
function md5(string) {
  function rotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX, lY) {
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | ((~x) & z); }
  function G(x, y, z) { return (x & z) | (y & (~z)); }
  function H(x, y, z) { return (x ^ y ^ z); }
  function I(x, y, z) { return (y ^ (x | (~z))); }
  function FF(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(str) {
    let lMessageLength = str.length;
    let lNumberOfWords_temp1 = lMessageLength + 8;
    let lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
    let lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    let lWordArray = Array(lNumberOfWords - 1);
    let lBytePosition = 0;
    let lByteCount = 0;
    let lWordIndex = 0;
    while (lByteCount < lMessageLength) {
      lWordIndex = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordIndex] = (lWordArray[lWordIndex] | (str.charCodeAt(lByteCount) << lBytePosition));
      lByteCount++;
    }
    lWordIndex = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordIndex] = lWordArray[lWordIndex] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    let WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;
      WordToHexValue_temp = "0" + lByte.toString(16);
      WordToHexValue = WordToHexValue + WordToHexValue_temp.substring(WordToHexValue_temp.length - 2, WordToHexValue_temp.length);
    }
    return WordToHexValue;
  }
  let x = Array();
  let k, AA, BB, CC, DD, a, b, c, d;
  let S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  let S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  let S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  let S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  x = convertToWordArray(string);
  a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

  for (k = 0; k < x.length; k += 16) {
    AA = a; BB = b; CC = c; DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
    b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
    a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
    c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
    c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
    a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
    a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
    d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
    a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
    a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
    a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
    c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
    a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
    c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
    b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
    c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
    d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
    c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
    a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
    d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
    b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

export const YANDEX_CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d";
const API_BASE = import.meta.env?.VITE_YANDEX_API_BASE || "/api/yandex";

function getBaseUrl() {
  if (typeof window !== "undefined" && window.location?.origin && window.location.origin.startsWith("http")) {
    return window.location.origin;
  }
  return "https://api.music.yandex.net";
}

async function fetchYandexApi(path, options = {}) {
  const headers = {
    "Accept": "application/json",
    "X-Yandex-Music-Client": "YandexMusicAndroid/24023241",
    "Client-Id": YANDEX_CLIENT_ID,
    ...(options.headers || {})
  };

  const isRelative = API_BASE.startsWith("/");
  const baseUrl = getBaseUrl();
  const primaryUrl = isRelative && baseUrl !== "https://api.music.yandex.net"
    ? `${baseUrl}${API_BASE}${path}`
    : `https://api.music.yandex.net${path}`;

  try {
    const res = await fetch(primaryUrl, { ...options, headers });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`[YandexMusic] Primary request failed for ${primaryUrl}, trying direct API...`, err);
  }

  // Fallback to direct Yandex API
  const directUrl = `https://api.music.yandex.net${path}`;
  const directRes = await fetch(directUrl, { ...options, headers });
  if (!directRes.ok) {
    throw new Error(`Yandex API request failed with status ${directRes.status}`);
  }
  return await directRes.json();
}

export function normalizeYandexTrack(item, index = 0) {
  const trackObj = item.track || item;
  const chartInfo = item.chart || trackObj.chart || {};
  const yandexId = String(trackObj.id || item.id);

  const artists = Array.isArray(trackObj.artists)
    ? trackObj.artists.map((a) => ({
        id: a.id,
        name: a.name,
        cover: a.cover?.uri ? `https://${a.cover.uri.replace("%%", "200x200")}` : null
      }))
    : [];

  const artistName = artists.map((a) => a.name).join(", ") || "Яндекс Музыка";

  let coverUrl = "/logo.png";
  if (trackObj.coverUri) {
    coverUrl = `https://${trackObj.coverUri.replace("%%", "400x400")}`;
  } else if (trackObj.albums && trackObj.albums[0]?.coverUri) {
    coverUrl = `https://${trackObj.albums[0].coverUri.replace("%%", "400x400")}`;
  } else if (trackObj.ogImage) {
    coverUrl = `https://${trackObj.ogImage.replace("%%", "400x400")}`;
  }

  const derivedColors = trackObj.derivedColors || {};

  return {
    id: `yandex_${yandexId}`,
    yandexId,
    source: "yandex",
    title: trackObj.title || "Без названия",
    rawTitle: trackObj.title || "Без названия",
    artist: artistName,
    artists,
    album: trackObj.albums?.[0]?.title || null,
    cover: coverUrl,
    duration: Math.round((trackObj.durationMs || 0) / 1000),
    chartPosition: chartInfo.position || index + 1,
    chartProgress: chartInfo.progress || "same", // "up", "down", "same", "new"
    chartShift: chartInfo.shift || 0,
    listeners: chartInfo.listeners || 0,
    palette: {
      base: derivedColors.average || "#1e102a",
      line: derivedColors.accent || "#8341EF",
      bright: derivedColors.miniPlayer || "#c084fc",
      shadow: derivedColors.average || "#0f0816"
    },
    streamUrl: null
  };
}

export async function getYandexChartTop100() {
  const data = await fetchYandexApi("/landing3/chart");
  const chartObj = data?.result?.chart || data?.result || {};
  const rawTracks = chartObj.tracks || [];

  return rawTracks.map((item, idx) => normalizeYandexTrack(item, idx));
}

export async function resolveYandexTrackStream(yandexTrackId) {
  const cleanId = String(yandexTrackId).replace(/^yandex_/, "");
  const downloadInfoRes = await fetchYandexApi(`/tracks/${cleanId}/download-info`);

  const results = downloadInfoRes?.result || [];
  if (!results.length) {
    throw new Error(`[YandexMusic] No download info available for track ${cleanId}`);
  }

  // Pick highest bitrate mp3
  const info = results.find((r) => r.codec === "mp3") || results[0];
  let downloadInfoUrl = info.downloadInfoUrl;

  if (typeof window !== "undefined" && downloadInfoUrl.startsWith("https://api.music.yandex.net")) {
    downloadInfoUrl = downloadInfoUrl.replace("https://api.music.yandex.net", API_BASE);
  }

  let linkRes;
  try {
    linkRes = await fetch(`${downloadInfoUrl}&format=json`, {
      headers: {
        "Accept": "application/json",
        "X-Yandex-Music-Client": "YandexMusicAndroid/24023241",
        "Client-Id": YANDEX_CLIENT_ID
      }
    });
  } catch (fetchErr) {
    const directUrl = info.downloadInfoUrl.startsWith("https://api.music.yandex.net")
      ? info.downloadInfoUrl
      : `https://api.music.yandex.net${info.downloadInfoUrl}`;
    linkRes = await fetch(`${directUrl}&format=json`, {
      headers: {
        "Accept": "application/json",
        "X-Yandex-Music-Client": "YandexMusicAndroid/24023241",
        "Client-Id": YANDEX_CLIENT_ID
      }
    });
  }

  if (!linkRes || !linkRes.ok) {
    throw new Error(`[YandexMusic] Failed to fetch link info: ${linkRes?.status}`);
  }

  const { host, path, ts, s } = await linkRes.json();
  const secret = "XGRMVkWcAW62RFVeH5E5";
  const pathClean = path.startsWith("/") ? path.substring(1) : path;
  const stringToHash = secret + pathClean + s;
  const hash = md5(stringToHash);

  return `https://${host}/get-mp3/${hash}/${ts}/${pathClean}`;
}
