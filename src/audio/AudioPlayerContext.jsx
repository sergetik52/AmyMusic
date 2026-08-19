import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  emptyTrack,
  hydrateSoundCloudTracks,
  normalizeTrackMetadata,
  resolveStreamUrl,
  getTrackWaveTracks
} from "../services/soundCloudApi";
import { getPlayerRuntimeSettings, subscribeProfileSettings } from "../services/profileSettings";
import { syncCollections, syncWave, getUsername } from "../api";
import { logDebug, logWarn } from "../utils/logger";
import Hls from "hls.js";

const AudioPlayerContext = createContext(null);

export const EQUALIZER_FREQUENCIES = [
  { freq: 60, label: "60 Гц", type: "lowshelf" },
  { freq: 170, label: "170 Гц", type: "peaking" },
  { freq: 310, label: "310 Гц", type: "peaking" },
  { freq: 600, label: "600 Гц", type: "peaking" },
  { freq: 1000, label: "1 кГц", type: "peaking" },
  { freq: 3000, label: "3 кГц", type: "peaking" },
  { freq: 6000, label: "6 кГц", type: "peaking" },
  { freq: 12000, label: "12 кГц", type: "peaking" },
  { freq: 14000, label: "14 кГц", type: "peaking" },
  { freq: 16000, label: "16 кГц", type: "highshelf" }
];

export const EQUALIZER_PRESETS = {
  flat: { name: "Сброс", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: "Усиление баса", gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  vocal: { name: "Вокал / Речь", gains: [-2, -1, 1, 3, 5, 4, 3, 1, 0, -1] },
  rock: { name: "Рок", gains: [5, 4, 2, -1, -2, 1, 3, 5, 5, 4] },
  pop: { name: "Поп", gains: [-1, 2, 4, 5, 3, 0, -1, -2, 1, 2] },
  electronic: { name: "Электроника", gains: [7, 5, 3, 0, -2, 2, 4, 6, 5, 4] },
  acoustic: { name: "Акустика", gains: [3, 2, 1, 2, 3, 3, 4, 4, 3, 2] },
  jazz: { name: "Джаз", gains: [4, 3, 1, 2, -1, -1, 0, 2, 3, 4] },
  treble: { name: "Высокие частоты", gains: [0, 0, 0, 0, 0, 2, 4, 6, 8, 9] }
};

const defaultPalette = {
  base: "#2a0a4a",
  line: "#9b5cff",
  bright: "#d8b4fe",
  shadow: "#4c1d95"
};

const STORAGE_KEY = "amymusic.audioState.v1";
const metadataRepairCache = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fadeAudioVolume(audio, from, to, durationMs) {
  if (!audio || durationMs <= 0) {
    if (audio) audio.volume = to;
    return Promise.resolve();
  }

  // Use setTimeout instead of requestAnimationFrame so fade works in background tabs
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const step = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      audio.volume = from + (to - from) * eased;

      if (progress >= 1) {
        audio.volume = to;
        resolve();
        return;
      }

      setTimeout(step, 16);
    };

    audio.volume = from;
    setTimeout(step, 0);
  });
}

function normalizeStoredTrack(track) {
  if (!track || typeof track !== "object" || !track.id) return null;
  return normalizeTrackMetadata({
    ...emptyTrack,
    ...track,
    id: String(track.id),
    palette: track.palette || emptyTrack.palette,
    // Reset snippet-length durations (≤ 30 s) so the track gets re-hydrated
    // with the real full_duration from SoundCloud API on next load.
    duration: track.duration && track.duration > 30 ? track.duration : 0
  });
}

function normalizeStoredRelease(release) {
  if (!release || typeof release !== "object" || !release.id) return null;
  return {
    id: String(release.id),
    title: release.title || "Untitled",
    kind: release.kind || "album",
    artist: release.artist || "SoundCloud",
    cover: release.cover || "/logo.png",
    permalinkUrl: release.permalinkUrl || "",
    createdAt: release.createdAt || "",
    trackCount: release.trackCount || release.tracks?.length || 0,
    tracks: Array.isArray(release.tracks)
      ? release.tracks.map(normalizeStoredTrack).filter(Boolean)
      : []
  };
}

function normalizeStoredPlaylist(playlist) {
  const release = normalizeStoredRelease(playlist);
  if (!release) return null;
  return {
    ...release,
    kind: "user-playlist",
    createdAt: release.createdAt || new Date().toISOString()
  };
}

function shouldRepairTrackMetadata(track) {
  return Boolean(
    track?.id &&
    track.id !== "empty" &&
    (
      !track.rawTitle ||
      !Array.isArray(track.artists) ||
      track.artists.length <= 1 ||
      // Also repair tracks whose duration looks like a 30-second snippet placeholder
      (typeof track.duration === "number" && track.duration > 0 && track.duration <= 30)
    )
  );
}

async function repairTrackListMetadata(tracks = []) {
  if (!tracks.some(shouldRepairTrackMetadata)) return tracks;

  const repairedTracks = [];

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (!shouldRepairTrackMetadata(track)) {
      repairedTracks.push(track);
      continue;
    }

    const key = String(track.id);
    if (!metadataRepairCache.has(key)) {
      metadataRepairCache.set(
        key,
        hydrateSoundCloudTracks([track], { forceMetadata: true })
          .then((items) => items[0] || track)
          .catch((error) => {
            logWarn("audio", "track metadata repair failed", {
              trackId: track.id,
              reason: error?.message
            });
            return track;
          })
      );
    }

    repairedTracks.push(await metadataRepairCache.get(key));
    if (index > 0 && index % 4 === 0) {
      await delay(120);
    }
  }

  return repairedTracks.map(normalizeStoredTrack).filter(Boolean);
}

async function repairReleaseListMetadata(releases = []) {
  if (!releases.some((release) => release.tracks?.some(shouldRepairTrackMetadata))) {
    return releases;
  }

  return Promise.all(
    releases.map(async (release) => {
      if (!release.tracks?.some(shouldRepairTrackMetadata)) return release;
      const tracks = await repairTrackListMetadata(release.tracks);
      return {
        ...release,
        tracks,
        trackCount: tracks.length || release.trackCount
      };
    })
  );
}

function readStoredAudioState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const queue = Array.isArray(parsed.queue)
      ? parsed.queue.map(normalizeStoredTrack).filter(Boolean)
      : [];
    const originalQueue = Array.isArray(parsed.originalQueue)
      ? parsed.originalQueue.map(normalizeStoredTrack).filter(Boolean)
      : [];
    const likedTracks = Array.isArray(parsed.likedTracks)
      ? parsed.likedTracks.map(normalizeStoredTrack).filter(Boolean)
      : [];
    const playHistory = Array.isArray(parsed.playHistory)
      ? parsed.playHistory.map(normalizeStoredTrack).filter(Boolean)
      : [];
    const savedReleases = Array.isArray(parsed.savedReleases)
      ? parsed.savedReleases.map(normalizeStoredRelease).filter(Boolean)
      : [];
    const userPlaylists = Array.isArray(parsed.userPlaylists)
      ? parsed.userPlaylists.map(normalizeStoredPlaylist).filter(Boolean)
      : [];

    return {
      queue,
      originalQueue,
      currentIndex: Math.min(Math.max(Number(parsed.currentIndex) || 0, 0), Math.max(queue.length - 1, 0)),
      volume: clampVolume(Number(parsed.volume ?? 0.74)),
      isMuted: Boolean(parsed.isMuted),
      isShuffle: Boolean(parsed.isShuffle),
      repeatMode: ["off", "one", "playlist"].includes(parsed.repeatMode) ? parsed.repeatMode : "off",
      likedTrackIds: new Set(Array.isArray(parsed.likedTrackIds) ? parsed.likedTrackIds.map(String) : likedTracks.map((track) => track.id)),
      likedTracks,
      dislikedTrackIds: new Set(Array.isArray(parsed.dislikedTrackIds) ? parsed.dislikedTrackIds.map(String) : []),
      dislikedTracks: Array.isArray(parsed.dislikedTracks)
        ? parsed.dislikedTracks.map(normalizeStoredTrack).filter(Boolean)
        : [],
      playHistory,
      savedReleaseIds: new Set(Array.isArray(parsed.savedReleaseIds) ? parsed.savedReleaseIds.map(String) : savedReleases.map((release) => release.id)),
      savedReleases,
      userPlaylists,
      totalListenedSeconds: Number(parsed.totalListenedSeconds) || 0
    };
  } catch (error) {
    logWarn("audio", "failed to read persisted state", error);
    return null;
  }
}

function writeStoredAudioState(state) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logWarn("audio", "failed to persist state", error);
  }
}

function clampVolume(value) {
  return Math.min(1, Math.max(0, value));
}

function shuffleTracks(tracks) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(value) {
  return clampByte(value).toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shadeColor(color, amount) {
  return {
    r: clampByte(color.r * amount),
    g: clampByte(color.g * amount),
    b: clampByte(color.b * amount)
  };
}

function colorDistance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function colorStats(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const brightness = (color.r + color.g + color.b) / 3;
  const saturation = max - min;
  return { brightness, saturation };
}

function quantizeColor({ r, g, b }, bucketSize = 24) {
  return {
    r: Math.round(r / bucketSize) * bucketSize,
    g: Math.round(g / bucketSize) * bucketSize,
    b: Math.round(b / bucketSize) * bucketSize
  };
}

function normalizePalette(palette) {
  if (!palette?.base || !palette?.line || !palette?.bright || !palette?.shadow) {
    return null;
  }
  return palette;
}

function extractPaletteFromImage(src, seed, fallbackPalette) {
  return new Promise((resolve) => {
    const fallback = normalizePalette(fallbackPalette) || defaultPalette;
    if (!src || src.startsWith("/")) {
      resolve(fallback);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        const clusters = new Map();

        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          if (a < 180) continue;
          const { brightness, saturation } = colorStats({ r, g, b });
          if (brightness < 10 || brightness > 246) continue;

          const bucket = quantizeColor({ r, g, b });
          const key = `${bucket.r}:${bucket.g}:${bucket.b}`;
          const current = clusters.get(key) || {
            r: 0,
            g: 0,
            b: 0,
            count: 0,
            saturationTotal: 0,
            brightnessTotal: 0
          };

          current.r += r;
          current.g += g;
          current.b += b;
          current.count += 1;
          current.saturationTotal += saturation;
          current.brightnessTotal += brightness;
          clusters.set(key, current);
        }

        const colors = [...clusters.values()]
          .map((cluster) => {
            const color = {
              r: cluster.r / cluster.count,
              g: cluster.g / cluster.count,
              b: cluster.b / cluster.count
            };
            const saturation = cluster.saturationTotal / cluster.count;
            const brightness = cluster.brightnessTotal / cluster.count;
            const midBrightness =
              1 - Math.min(1, Math.abs(brightness - 118) / 118);
            const colorfulness = Math.max(0.12, saturation / 255);
            const frequency = Math.sqrt(cluster.count);

            return {
              r: color.r,
              g: color.g,
              b: color.b,
              count: cluster.count,
              brightness,
              saturation,
              score: frequency * (0.62 + colorfulness * 1.75) * (0.45 + midBrightness * 0.9)
            };
          })
          .filter((color) => color.count >= 3);

        if (!colors.length) {
          resolve(fallback);
          return;
        }

        colors.sort((a, b) => b.score - a.score);
        const primary = colors[0];
        const secondary =
          colors.find((color) => colorDistance(color, primary) > 58) || primary;
        const base = shadeColor(primary, 0.42);
        const line = primary;
        const bright = secondary.brightness > primary.brightness ? secondary : primary;
        const shadow = shadeColor(primary, 0.2);

        resolve({
          base: rgbToHex(base),
          line: rgbToHex(line),
          bright: rgbToHex(bright),
          shadow: rgbToHex(shadow)
        });
      } catch (error) {
        logWarn("palette", "cover pixels unavailable, using fallback palette", error);
        resolve(fallback);
      }
    };

    image.onerror = () => resolve(fallback);
    image.src = src;
  });
}

function averageRange(data, start, end) {
  let total = 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    total += data[index] || 0;
    count += 1;
  }
  return count ? total / count / 255 : 0;
}

function getMediaArtworkUrl(src) {
  if (typeof window === "undefined") return "";

  try {
    return new URL(src || "/logo.png", window.location.href).toString();
  } catch {
    return new URL("/logo.png", window.location.href).toString();
  }
}

function setMediaSessionAction(mediaSession, action, handler) {
  try {
    mediaSession.setActionHandler(action, handler);
  } catch (error) {
    logDebug("audio", `media session action unsupported: ${action}`, error);
  }
}

export function AudioProvider({ children }) {
  const storedAudioStateRef = useRef(null);
  if (storedAudioStateRef.current === null) {
    storedAudioStateRef.current = readStoredAudioState() || false;
  }
  const storedAudioState = storedAudioStateRef.current || {};
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const frequencyDataRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastAnalysisAtRef = useRef(0);
  const [queue, setQueue] = useState(() => storedAudioState.queue || []);
  const [originalQueue, setOriginalQueue] = useState(() => storedAudioState.originalQueue || storedAudioState.queue || []);
  const [currentIndex, setCurrentIndex] = useState(() => storedAudioState.currentIndex || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(() => storedAudioState.volume ?? 0.74);
  const [isMuted, setIsMuted] = useState(() => storedAudioState.isMuted || false);
  const [isShuffle, setIsShuffle] = useState(() => storedAudioState.isShuffle || false);
  const [repeatMode, setRepeatMode] = useState(() => storedAudioState.repeatMode || "off");
  const [likedTrackIds, setLikedTrackIds] = useState(() => storedAudioState.likedTrackIds || new Set());
  const [likedTracks, setLikedTracks] = useState(() => storedAudioState.likedTracks || []);
  const [dislikedTrackIds, setDislikedTrackIds] = useState(() => storedAudioState.dislikedTrackIds || new Set());
  const [dislikedTracks, setDislikedTracks] = useState(() => storedAudioState.dislikedTracks || []);
  const [playHistory, setPlayHistory] = useState(() => storedAudioState.playHistory || []);
  const [savedReleaseIds, setSavedReleaseIds] = useState(() => storedAudioState.savedReleaseIds || new Set());
  const [savedReleases, setSavedReleases] = useState(() => storedAudioState.savedReleases || []);
  const [userPlaylists, setUserPlaylists] = useState(() => storedAudioState.userPlaylists || []);
  const [totalListenedSeconds, setTotalListenedSeconds] = useState(() => storedAudioState.totalListenedSeconds || 0);
  const [playerSettings, setPlayerSettings] = useState(() => getPlayerRuntimeSettings());
  const [trackPalette, setTrackPalette] = useState(defaultPalette);
  const [audioEnergy, setAudioEnergy] = useState({
    bass: 0,
    mids: 0,
    treble: 0,
    level: 0
  });
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [isFullOpen, setIsFullOpen] = useState(false);
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);

  const [isEqualizerEnabled, setIsEqualizerEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("amymusic.equalizerEnabled.v1");
      return stored !== null ? JSON.parse(stored) : true;
    } catch { return true; }
  });
  const [equalizerGains, setEqualizerGains] = useState(() => {
    try {
      const stored = localStorage.getItem("amymusic.equalizerGains.v1");
      return stored ? JSON.parse(stored) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    } catch { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  });
  const [equalizerPreset, setEqualizerPresetState] = useState(() => {
    try {
      return localStorage.getItem("amymusic.equalizerPreset.v1") || "flat";
    } catch { return "flat"; }
  });

  const eqFiltersRef = useRef([]);
  const equalizerGainsRef = useRef(equalizerGains);
  const isEqualizerEnabledRef = useRef(isEqualizerEnabled);

  useEffect(() => {
    equalizerGainsRef.current = equalizerGains;
    isEqualizerEnabledRef.current = isEqualizerEnabled;
    try {
      localStorage.setItem("amymusic.equalizerGains.v1", JSON.stringify(equalizerGains));
      localStorage.setItem("amymusic.equalizerEnabled.v1", JSON.stringify(isEqualizerEnabled));
      localStorage.setItem("amymusic.equalizerPreset.v1", equalizerPreset);
    } catch {}

    if (eqFiltersRef.current.length && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      eqFiltersRef.current.forEach((filter, idx) => {
        const val = isEqualizerEnabled ? (equalizerGains[idx] ?? 0) : 0;
        filter.gain.setTargetAtTime(val, now, 0.02);
      });
    }
  }, [equalizerGains, isEqualizerEnabled, equalizerPreset]);

  const setEqualizerGain = useCallback((bandIndex, valueDb) => {
    const clamped = Math.min(12, Math.max(-12, Number(valueDb) || 0));
    setEqualizerGains((prev) => {
      const next = [...prev];
      next[bandIndex] = clamped;
      return next;
    });
    setEqualizerPresetState("custom");
  }, []);

  const setEqualizerPreset = useCallback((presetKey) => {
    const preset = EQUALIZER_PRESETS[presetKey];
    if (preset) {
      setEqualizerGains([...preset.gains]);
      setEqualizerPresetState(presetKey);
    }
  }, []);

  const resetEqualizer = useCallback(() => {
    setEqualizerGains([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setEqualizerPresetState("flat");
  }, []);

  const showNotification = useCallback((message, type = "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

  const currentTrack = queue[currentIndex] || emptyTrack;
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const repeatModeRef = useRef(repeatMode);
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const playerSettingsRef = useRef(playerSettings);
  const explicitLoadTrackIdRef = useRef("");
  const loadedTrackIdRef = useRef("");
  const loadRequestIdRef = useRef(0);
  const pendingAutoplayRef = useRef(false);
  const didMountTrackLoaderRef = useRef(false);
  const didRepairStoredMetadataRef = useRef(false);
  // Refs for volume/mute to avoid recreating loadTrack on every volume change
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  // HLS instance ref for tracks that only have HLS transcodings
  const hlsRef = useRef(null);
  // Track the last resolved CDN stream URL (audio.src may be blob:// when using HLS)
  const loadedStreamUrlRef = useRef("");
  const manualActionRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
    isShuffleRef.current = isShuffle;
    repeatModeRef.current = repeatMode;
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    playerSettingsRef.current = playerSettings;
  }, [currentTrack, isPlaying, isShuffle, playerSettings, queue, repeatMode]);

  useEffect(() =>
    subscribeProfileSettings(() => {
      setPlayerSettings(getPlayerRuntimeSettings());
    }),
    []
  );

  useEffect(() => {
    writeStoredAudioState({
      queue: queue.slice(0, 120),
      originalQueue: originalQueue.slice(0, 120),
      currentIndex,
      volume,
      isMuted,
      isShuffle,
      repeatMode,
      likedTrackIds: [...likedTrackIds],
      likedTracks: likedTracks.slice(0, 300),
      dislikedTrackIds: [...dislikedTrackIds],
      dislikedTracks: dislikedTracks.slice(0, 200),
      playHistory: playHistory.slice(0, 100),
      savedReleaseIds: [...savedReleaseIds],
      savedReleases: savedReleases.slice(0, 120),
      userPlaylists: userPlaylists.slice(0, 80),
      totalListenedSeconds
    });
  }, [
    currentIndex,
    dislikedTrackIds,
    dislikedTracks,
    isMuted,
    isShuffle,
    likedTrackIds,
    likedTracks,
    originalQueue,
    playHistory,
    queue,
    repeatMode,
    savedReleaseIds,
    savedReleases,
    userPlaylists,
    volume,
    totalListenedSeconds
  ]);

  useEffect(() => {
    if (didRepairStoredMetadataRef.current) return;
    didRepairStoredMetadataRef.current = true;

    let isMounted = true;

    async function repairStoredMetadata() {
      const needsRepair =
        queue.some(shouldRepairTrackMetadata) ||
        originalQueue.some(shouldRepairTrackMetadata) ||
        likedTracks.some(shouldRepairTrackMetadata) ||
        playHistory.some(shouldRepairTrackMetadata) ||
        savedReleases.some((release) => release.tracks?.some(shouldRepairTrackMetadata)) ||
        userPlaylists.some((playlist) => playlist.tracks?.some(shouldRepairTrackMetadata));

      if (!needsRepair) return;

      try {
        logDebug("audio", "repairing stored track metadata");
        const repairedQueue = await repairTrackListMetadata(queue);
        const repairedOriginalQueue = await repairTrackListMetadata(originalQueue);
        const repairedLikedTracks = await repairTrackListMetadata(likedTracks);
        const repairedPlayHistory = await repairTrackListMetadata(playHistory);
        const repairedSavedReleases = await repairReleaseListMetadata(savedReleases);
        const repairedUserPlaylists = await repairReleaseListMetadata(userPlaylists);

        if (!isMounted) return;
        setQueue(repairedQueue);
        setOriginalQueue(repairedOriginalQueue);
        setLikedTracks(repairedLikedTracks);
        setPlayHistory(repairedPlayHistory);
        setSavedReleases(repairedSavedReleases);
        setUserPlaylists(repairedUserPlaylists);
      } catch (repairError) {
        logWarn("audio", "failed to repair stored track metadata", repairError);
      }
    }

    const timer = setTimeout(repairStoredMetadata, 2500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return null;

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;

      const context = new AudioContextClass({ latencyHint: "playback" });
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;

      const source = context.createMediaElementSource(audio);

      // High-fidelity Audio DSP Chain (Bass punch + Treble clarity + Compressor limiter)
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 12;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // 10-Band Real Equalizer BiquadFilterNodes
      const eqFilters = EQUALIZER_FREQUENCIES.map((band, idx) => {
        const filter = context.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = band.type === "peaking" ? 1.4 : 1;
        const targetGain = isEqualizerEnabledRef.current ? (equalizerGainsRef.current[idx] ?? 0) : 0;
        filter.gain.value = targetGain;
        return filter;
      });
      eqFiltersRef.current = eqFilters;

      let currentSource = source;
      eqFilters.forEach((filter) => {
        currentSource.connect(filter);
        currentSource = filter;
      });

      currentSource.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return analyserRef.current;
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioEnergy({ bass: 0, mids: 0, treble: 0, level: 0 });
  }, []);

  const startAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) return;

    const tick = (time) => {
      const analyser = analyserRef.current;
      const data = frequencyDataRef.current;

      if (analyser && data && time - lastAnalysisAtRef.current > 42) {
        if (!document.hidden) {
          analyser.getByteFrequencyData(data);
          const bass = averageRange(data, 1, 12);
          const mids = averageRange(data, 12, 70);
          const treble = averageRange(data, 70, data.length);
          const level = Math.min(1, bass * 0.58 + mids * 0.3 + treble * 0.18);

          setAudioEnergy({
            bass: Number(bass.toFixed(3)),
            mids: Number(mids.toFixed(3)),
            treble: Number(treble.toFixed(3)),
            level: Number(level.toFixed(3))
          });
        }
        lastAnalysisAtRef.current = time;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.volume = volume;
    audio.playbackRate = 1.0; // explicit safety: never allow accidental speed-up
    audioRef.current = audio;
    logDebug("audio", "HTMLAudioElement created", { volume });

    const lastTimeRef = { current: 0 };
    const isSeekingRef = { current: false };
    const handleSeeking = () => {
      isSeekingRef.current = true;
    };
    const handleSeeked = () => {
      isSeekingRef.current = false;
      // Reset last time to new position so delta is not counted
      lastTimeRef.current = audio.currentTime || 0;
    };
    const handleTimeUpdate = () => {
      const now = audio.currentTime || 0;
      const prev = lastTimeRef.current;
      // Only count time if not seeking and progressing naturally
      if (!isSeekingRef.current && now > prev && now - prev < 2) {
        setTotalListenedSeconds((s) => s + (now - prev));
      }
      lastTimeRef.current = now;
      setCurrentTime(now);
    };
    const handleDurationChange = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      logDebug("audio", "durationchange", { duration: audio.duration });
    };
    const handlePlay = () => {
      logDebug("audio", "play event", { src: audio.src });
      setIsPlaying(true);
      startAudioAnalysis();
    };
    const handlePause = () => {
      logDebug("audio", "pause event");
      setIsPlaying(false);
      stopAudioAnalysis();
    };
    const handleWaiting = () => {
      logDebug("audio", "waiting event");
      setIsLoading(true);
    };
    const handleCanPlay = () => {
      logDebug("audio", "canplay event");
      setIsLoading(false);
    };
    const handleEnded = () => {
      const nextQueue = queueRef.current;
      const nextRepeatMode = repeatModeRef.current;
      const nextIsShuffle = isShuffleRef.current;
      const safeDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const safeCurrentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

      // Only ignore ended events that fire VERY early (< 25 s into playback).
      // Allowing currentTime >= 25 means 30-second HLS snippets always advance
      // to the next track even when the manifest reports the full track duration.
      if (safeDuration > 2 && safeCurrentTime < safeDuration - 0.75 && safeCurrentTime < 25) {
        logDebug("audio", "ignored early ended event", {
          currentTime: safeCurrentTime,
          duration: safeDuration
        });
        return;
      }

      logDebug("audio", "ended event", {
        currentTime: safeCurrentTime,
        duration: safeDuration
      });
      if (nextRepeatMode === "one") {
        audio.currentTime = 0;
        audio.play().catch((error) => {
          logWarn("audio", "repeat one failed", error);
          setIsPlaying(false);
        });
        return;
      }

      setCurrentIndex((index) => {
        if (nextQueue.length <= 1) return index;
        if (nextIsShuffle) {
          pendingAutoplayRef.current = true;
          const nextIndex = Math.floor(Math.random() * nextQueue.length);
          return nextIndex === index ? (index + 1) % nextQueue.length : nextIndex;
        }
        if (index < nextQueue.length - 1) {
          pendingAutoplayRef.current = true;
          return index + 1;
        }
        if (nextRepeatMode === "playlist") {
          pendingAutoplayRef.current = true;
          return 0;
        }
        pendingAutoplayRef.current = false;
        setIsPlaying(false);
        return index;
      });
    };
    const handleError = () => {
      setIsLoading(false);
      const curTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      logWarn("audio", "error event", {
        code: audio.error?.code,
        message: audio.error?.message,
        src: audio.src,
        currentTime: curTime
      });

      // If the stream was cut after >= 20 s of playback it is almost certainly
      // a SoundCloud snippet-policy restriction, not a real network error.
      // Auto-advance to the next track instead of stopping completely.
      if (curTime >= 20) {
        logDebug("audio", "auto-advancing after snippet/stream-cut", { currentTime: curTime });
        const nextQueue = queueRef.current;
        const nextRepeatMode = repeatModeRef.current;
        setCurrentIndex((index) => {
          if (nextQueue.length <= 1) {
            pendingAutoplayRef.current = false;
            setIsPlaying(false);
            return index;
          }
          if (index < nextQueue.length - 1) {
            pendingAutoplayRef.current = true;
            return index + 1;
          }
          if (nextRepeatMode === "playlist") {
            pendingAutoplayRef.current = true;
            return 0;
          }
          pendingAutoplayRef.current = false;
          setIsPlaying(false);
          return index;
        });
      } else {
        setIsPlaying(false);
        setError("Не удалось загрузить аудиопоток");
      }
    };;

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeking", handleSeeking);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      stopAudioAnalysis();
      // Destroy HLS instance before pausing audio
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeking", handleSeeking);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audioContextRef.current?.close?.();
      audioContextRef.current = null;
      analyserRef.current = null;
      frequencyDataRef.current = null;
    };
  }, [startAudioAnalysis, stopAudioAnalysis]);

  useEffect(() => {
    let isMounted = true;

    extractPaletteFromImage(
      currentTrack.cover,
      `${currentTrack.id}:${currentTrack.title}`,
      currentTrack.palette
    ).then((palette) => {
      if (isMounted) {
        setTrackPalette(palette);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentTrack.cover, currentTrack.id, currentTrack.title, currentTrack.palette]);

  useEffect(() => {
    // Keep refs in sync so loadTrack can read current values without being recreated
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      logDebug("audio", "volume changed", {
        volume,
        effectiveVolume: audioRef.current.volume,
        isMuted
      });
    }
  }, [volume, isMuted]);

  const loadTrack = useCallback(async (track, shouldPlay = false, isManual = false) => {
    const audio = audioRef.current;
    if (!audio || !track) return false;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    setIsLoading(true);
    setError("");
    try {
      logDebug("audio", "loadTrack:start", {
        id: track.id,
        title: track.title,
        shouldPlay
      });
      const streamUrl = await resolveStreamUrl(track);
      if (requestId !== loadRequestIdRef.current) {
        logDebug("audio", "loadTrack:stale-request", {
          id: track.id,
          title: track.title
        });
        return false;
      }
      if (!streamUrl) {
        throw new Error("Track has no stream URL");
      }
      // Use refs so this function doesn't depend on volume/isMuted state
      const targetVolume = isMutedRef.current ? 0 : volumeRef.current;
      // Use loadedStreamUrlRef because audio.src may be a blob:// URL when HLS is active
      const isSameLoadedTrack =
        loadedTrackIdRef.current === String(track.id) &&
        loadedStreamUrlRef.current === streamUrl;

      if (isSameLoadedTrack) {
        audio.volume = targetVolume;
        if (shouldPlay && audio.paused) {
          await ensureAudioGraph();
          await audio.play();
        }
        return true;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      loadedTrackIdRef.current = String(track.id);
      loadedStreamUrlRef.current = streamUrl;
      setCurrentTime(0);

      // Detect HLS streams — Chromium/Electron don't support m3u8 natively
      const isHlsStream =
        /\.m3u8($|\?)/i.test(streamUrl) ||
        streamUrl.includes("/hls/") ||
        streamUrl.includes("format=hls");

      logDebug("audio", "loadTrack:loaded-src", {
        id: track.id,
        title: track.title,
        streamUrl,
        isHlsStream
      });

      if (isHlsStream && Hls.isSupported()) {
        // Play HLS stream via hls.js (uses MSE internally)
        const hls = new Hls({ enableWorker: false, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(audio);
        audio.volume = targetVolume;

        if (shouldPlay) {
          await new Promise((resolve, reject) => {
            const onManifest = () => {
              hls.off(Hls.Events.ERROR, onFatalError);
              resolve();
            };
            const onFatalError = (_, data) => {
              if (data.fatal) {
                hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
                reject(new Error(`HLS fatal error: ${data.details}`));
              }
            };
            hls.once(Hls.Events.MANIFEST_PARSED, onManifest);
            hls.once(Hls.Events.ERROR, onFatalError);
            setTimeout(() => {
              hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
              hls.off(Hls.Events.ERROR, onFatalError);
              reject(new Error("HLS manifest load timeout"));
            }, 12000);
          });
          await ensureAudioGraph();
          await audio.play();
        } else {
          audio.volume = targetVolume;
        }
      } else {
        // Progressive MP3 stream — standard HTMLAudioElement flow
        audio.src = streamUrl;
        audio.volume = targetVolume;
        audio.load();

        if (shouldPlay) {
          await ensureAudioGraph();
          await audio.play();
        } else {
          audio.volume = targetVolume;
        }
      }
      return true;
    } catch (loadError) {
      if (requestId !== loadRequestIdRef.current) return false;
      logWarn("audio", "loadTrack:failed", loadError);
      setError(loadError.message || "Не удалось загрузить аудиопоток");
      setIsPlaying(false);
      return false;
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
    // volume and isMuted removed from deps — we read them via refs to avoid
    // recreating this function (and restarting the song) on every volume change
  }, [ensureAudioGraph]);

  useEffect(() => {
    if (!didMountTrackLoaderRef.current) {
      didMountTrackLoaderRef.current = true;
      return;
    }

    const nextTrack = queue[currentIndex] || emptyTrack;
    if (!nextTrack?.id || nextTrack.id === "empty") return;

    if (explicitLoadTrackIdRef.current === nextTrack.id) {
      explicitLoadTrackIdRef.current = "";
      return;
    }

    const shouldPlay = pendingAutoplayRef.current || isPlayingRef.current;
    pendingAutoplayRef.current = false;
    loadTrack(nextTrack, shouldPlay, manualActionRef.current);
    manualActionRef.current = false;
  }, [currentIndex, queue, loadTrack]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError("");
    try {
      logDebug("audio", "play requested", {
        hasSrc: Boolean(audio.src),
        currentTrack: currentTrackRef.current
      });
      if (!audio.src) {
        pendingAutoplayRef.current = true;
        await loadTrack(currentTrackRef.current, true);
        return;
      }
      await ensureAudioGraph();
      await audio.play();
    } catch (playError) {
      logWarn("audio", "play failed", playError);
      setError(playError.message || "Не удалось начать воспроизведение");
      setIsPlaying(false);
    }
  }, [ensureAudioGraph, loadTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current?.paused === false) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  const playTrack = useCallback(
    async (track, nextQueue = queue) => {
      logDebug("audio", "playTrack requested", {
        id: track.id,
        title: track.title,
        queueLength: nextQueue.length
      });
      const existingIndex = nextQueue.findIndex((item) => item.id === track.id);
      const resolvedQueue = existingIndex >= 0 ? nextQueue : [track, ...nextQueue];
      const resolvedIndex = existingIndex >= 0 ? existingIndex : 0;

      explicitLoadTrackIdRef.current = track.id;
      pendingAutoplayRef.current = true;
      manualActionRef.current = true;
      setOriginalQueue(resolvedQueue);

      if (isShuffleRef.current && resolvedQueue.length > 1) {
        const rest = resolvedQueue.filter((item) => item.id !== track.id);
        setQueue([track, ...shuffleTracks(rest)]);
        setCurrentIndex(0);
      } else {
        setQueue(resolvedQueue);
        setCurrentIndex(resolvedIndex);
      }

      setPlayHistory((history) => [
        track,
        ...history.filter((item) => item.id !== track.id)
      ].slice(0, 50));

      const didLoad = await loadTrack(track, true, true);
      return didLoad;
    },
    [loadTrack, queue]
  );

  const next = useCallback(() => {
    if (queue.length <= 1) return;
    manualActionRef.current = true;
    setCurrentIndex((index) => {
      if (index < queue.length - 1) {
        pendingAutoplayRef.current = isPlayingRef.current;
        return index + 1;
      }
      if (repeatMode === "playlist") {
        pendingAutoplayRef.current = isPlayingRef.current;
        return 0;
      }
      return index;
    });
  }, [queue.length, repeatMode]);

  const previous = useCallback(() => {
    if (queue.length <= 1) return;
    manualActionRef.current = true;
    pendingAutoplayRef.current = isPlayingRef.current;
    setCurrentIndex((index) => (index - 1 + queue.length) % queue.length);
  }, [queue.length]);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(seconds, 0), duration || seconds);
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const setVolume = useCallback((nextVolume) => {
    const normalized = clampVolume(nextVolume);
    setVolumeState(normalized);
    if (normalized > 0) {
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((value) => !value);
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((value) => {
      const shouldShuffle = !value;
      const current = queueRef.current[currentIndex] || currentTrackRef.current;

      if (shouldShuffle && queueRef.current.length > 1) {
        setOriginalQueue(queueRef.current);
        const rest = queueRef.current.filter((track) => track.id !== current.id);
        explicitLoadTrackIdRef.current = current.id;
        setQueue([current, ...shuffleTracks(rest)]);
        setCurrentIndex(0);
      } else if (!shouldShuffle && originalQueue.length > 0) {
        const restoredIndex = originalQueue.findIndex((track) => track.id === current.id);
        explicitLoadTrackIdRef.current = current.id;
        setQueue(originalQueue);
        setCurrentIndex(restoredIndex >= 0 ? restoredIndex : 0);
      }

      showNotification(shouldShuffle ? "Случайный порядок включен" : "По порядку", "info");
      return shouldShuffle;
    });
  }, [currentIndex, originalQueue, showNotification]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((mode) => {
      if (mode === "off") {
        showNotification("Повтор: один трек", "info");
        return "one";
      }
      if (mode === "one") {
        showNotification("Повтор: плейлист", "info");
        return "playlist";
      }
      showNotification("Повтор выключен", "info");
      return "off";
    });
  }, [showNotification]);

  const setTracks = useCallback((tracks, startIndex = 0) => {
    if (!tracks.length) return;
    logDebug("audio", "setTracks", {
      count: tracks.length,
      startIndex,
      first: tracks[0]
    });
    setOriginalQueue(tracks);
    setQueue(tracks);
    setCurrentIndex(startIndex);
  }, []);

  const appendTracks = useCallback((tracks) => {
    if (!tracks?.length) return 0;

    let addedCount = 0;
    setQueue((currentQueue) => {
      // Only deduplicate against the last 50 tracks in the queue to support infinite wave generation
      const recentQueueSlice = currentQueue.slice(-50);
      const existingIds = new Set(recentQueueSlice.map((track) => String(track.id)));
      const nextTracks = tracks.filter((track) => {
        if (!track?.id || existingIds.has(String(track.id))) return false;
        existingIds.add(String(track.id));
        return true;
      });

      addedCount = nextTracks.length;
      if (!nextTracks.length) return currentQueue;
      return [...currentQueue, ...nextTracks];
    });

    setOriginalQueue((currentQueue) => {
      const recentQueueSlice = currentQueue.slice(-50);
      const existingIds = new Set(recentQueueSlice.map((track) => String(track.id)));
      const nextTracks = tracks.filter((track) => {
        if (!track?.id || existingIds.has(String(track.id))) return false;
        existingIds.add(String(track.id));
        return true;
      });

      if (!nextTracks.length) return currentQueue;
      return [...currentQueue, ...nextTracks];
    });

    logDebug("audio", "appendTracks", {
      requested: tracks.length,
      added: addedCount
    });

    return addedCount;
  }, []);

  const toggleLike = useCallback((trackId = currentTrack.id, track = currentTrack) => {
    setLikedTrackIds((ids) => {
      const nextIds = new Set(ids);
      if (nextIds.has(trackId)) {
        nextIds.delete(trackId);
        setLikedTracks((tracks) => tracks.filter((item) => item.id !== trackId));
        showNotification("Удалено из Любимых", "info");
      } else {
        nextIds.add(trackId);
        if (track && track.id && track.id !== "empty") {
          setLikedTracks((tracks) => {
            if (tracks.some((item) => item.id === track.id)) return tracks;
            return [track, ...tracks];
          });
        }
        showNotification("Добавлено в Любимые", "success");
      }
      return nextIds;
    });
  }, [currentTrack, showNotification]);

  const toggleDislike = useCallback((trackId = currentTrack.id, track = currentTrack) => {
    // If trackId is an event object (e.g. from onClick direct binding), fallback to currentTrack
    const targetId = (trackId && typeof trackId === "object" && (trackId.nativeEvent || trackId.preventDefault)) 
      ? currentTrack.id 
      : trackId;
    const targetTrack = (trackId && typeof trackId === "object" && (trackId.nativeEvent || trackId.preventDefault)) 
      ? currentTrack 
      : track;

    if (!targetId || targetId === "empty") return;

    setDislikedTrackIds((ids) => {
      const nextIds = new Set(ids);
      if (nextIds.has(targetId)) {
        nextIds.delete(targetId);
        setDislikedTracks((prev) => prev.filter((t) => t.id !== targetId));
        showNotification("Дизлайк отменен", "info");
      } else {
        nextIds.add(targetId);
        if (targetTrack && targetTrack.id && targetTrack.id !== "empty") {
          setDislikedTracks((prev) => {
            if (prev.some((t) => t.id === targetId)) return prev;
            return [targetTrack, ...prev].slice(0, 200);
          });
        }
        showNotification("Трек скрыт (Дизлайк)", "info");

        // Automatically skip to next track if disliking the current track!
        if (targetId === currentTrackRef.current?.id) {
          setTimeout(() => {
            next();
          }, 100);
        }
      }
      return nextIds;
    });

    setLikedTrackIds((ids) => {
      if (!ids.has(targetId)) return ids;
      const nextIds = new Set(ids);
      nextIds.delete(targetId);
      return nextIds;
    });
    setLikedTracks((tracks) => tracks.filter((item) => item.id !== targetId));
  }, [currentTrack.id, currentTrack, next, showNotification]);

  const removeFromQueue = useCallback((targetIndexOrTrack) => {
    setQueue((prevQueue) => {
      let indexToRemove = -1;
      if (typeof targetIndexOrTrack === "number") {
        indexToRemove = targetIndexOrTrack;
      } else if (targetIndexOrTrack && (typeof targetIndexOrTrack === "string" || typeof targetIndexOrTrack === "number")) {
        indexToRemove = prevQueue.findIndex((t) => String(t.id) === String(targetIndexOrTrack));
      } else if (targetIndexOrTrack && targetIndexOrTrack.id) {
        indexToRemove = prevQueue.findIndex((t) => String(t.id) === String(targetIndexOrTrack.id));
      }

      if (indexToRemove < 0 || indexToRemove >= prevQueue.length) return prevQueue;

      if (prevQueue.length <= 1) {
        showNotification("В очереди остался последний трек", "info");
        return prevQueue;
      }

      const removedTrack = prevQueue[indexToRemove];
      const nextQueue = prevQueue.filter((_, idx) => idx !== indexToRemove);

      setCurrentIndex((currIndex) => {
        if (currIndex > indexToRemove) return currIndex - 1;
        if (currIndex === indexToRemove) {
          return Math.min(currIndex, nextQueue.length - 1);
        }
        return currIndex;
      });

      showNotification(`Удалено из очереди: ${removedTrack?.title || "Трек"}`, "info");
      return nextQueue;
    });
  }, [showNotification]);

  const reorderQueue = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setQueue((prevQueue) => {
      if (fromIndex >= prevQueue.length || toIndex >= prevQueue.length) return prevQueue;
      const nextQueue = [...prevQueue];
      const [movedItem] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, movedItem);

      setCurrentIndex((currIndex) => {
        if (currIndex === fromIndex) return toIndex;
        if (fromIndex < currIndex && toIndex >= currIndex) return currIndex - 1;
        if (fromIndex > currIndex && toIndex <= currIndex) return currIndex + 1;
        return currIndex;
      });

      return nextQueue;
    });
  }, []);

  const reorderPlaylistTracks = useCallback((playlistId, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setUserPlaylists((prevPlaylists) => {
      return prevPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const tracks = pl.tracks ? [...pl.tracks] : [];
        if (fromIndex >= tracks.length || toIndex >= tracks.length) return pl;
        const [moved] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, moved);
        return { ...pl, tracks, updatedAt: Date.now() };
      });
    });
  }, []);

  const toggleSavedRelease = useCallback((release) => {
    const normalized = normalizeStoredRelease(release);
    if (!normalized) return;

    setSavedReleaseIds((ids) => {
      const nextIds = new Set(ids);
      if (nextIds.has(normalized.id)) {
        nextIds.delete(normalized.id);
        setSavedReleases((releases) => releases.filter((item) => item.id !== normalized.id));
        showNotification(`Удалено из коллекции: ${normalized.title}`, "info");
      } else {
        nextIds.add(normalized.id);
        setSavedReleases((releases) => {
          if (releases.some((item) => item.id === normalized.id)) return releases;
          return [normalized, ...releases];
        });
        showNotification(`Сохранено в коллекцию: ${normalized.title}`, "success");
      }
      return nextIds;
    });
  }, [showNotification]);

  const createUserPlaylist = useCallback((title, coverUrl) => {
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) return null;

    const playlist = {
      id: `local-${Date.now()}`,
      title: normalizedTitle,
      kind: "user-playlist",
      artist: "Amy Music",
      cover: coverUrl || "/logo.png",
      permalinkUrl: "",
      createdAt: new Date().toISOString(),
      trackCount: 0,
      tracks: []
    };

    setUserPlaylists((playlists) => [playlist, ...playlists]);
    showNotification(`Создан плейлист: ${normalizedTitle}`, "success");
    return playlist;
  }, [showNotification]);

  const addTrackToUserPlaylist = useCallback((playlistId, track) => {
    const normalizedTrack = normalizeStoredTrack(track);
    if (!playlistId || !normalizedTrack) return;

    let targetTitle = "";
    setUserPlaylists((playlists) =>
      playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        targetTitle = playlist.title;
        if (playlist.tracks.some((item) => item.id === normalizedTrack.id)) return playlist;
        const tracks = [normalizedTrack, ...playlist.tracks];
        return {
          ...playlist,
          cover: playlist.cover === "/logo.png" ? normalizedTrack.cover : playlist.cover,
          trackCount: tracks.length,
          tracks
        };
      })
    );
    showNotification(`Добавлено в плейлист: ${targetTitle}`, "success");
  }, [showNotification]);

  const updateUserPlaylist = useCallback((playlistId, updates) => {
    if (!playlistId || !updates) return;

    setUserPlaylists((playlists) =>
      playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        return {
          ...playlist,
          title: typeof updates.title === "string" && updates.title.trim()
            ? updates.title.trim()
            : playlist.title,
          cover: typeof updates.cover === "string" && updates.cover.trim()
            ? updates.cover.trim()
            : playlist.cover,
          tracks: Array.isArray(updates.tracks)
            ? updates.tracks.map(normalizeStoredTrack).filter(Boolean)
            : playlist.tracks,
          trackCount: Array.isArray(updates.tracks)
            ? updates.tracks.map(normalizeStoredTrack).filter(Boolean).length
            : playlist.trackCount
        };
      })
    );
    showNotification("Плейлист обновлен", "success");
  }, [showNotification]);

  const removeTrackFromUserPlaylist = useCallback((playlistId, trackId) => {
    if (!playlistId || !trackId) return;

    setUserPlaylists((playlists) =>
      playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const tracks = playlist.tracks.filter((track) => track.id !== trackId);
        return {
          ...playlist,
          cover: tracks[0]?.cover || "/logo.png",
          trackCount: tracks.length,
          tracks
        };
      })
    );
    showNotification("Удалено из плейлиста", "info");
  }, [showNotification]);

  const deleteUserPlaylist = useCallback((playlistId) => {
    if (!playlistId) return;
    setUserPlaylists((playlists) => playlists.filter((playlist) => playlist.id !== playlistId));
    showNotification("Плейлист удален", "info");
  }, [showNotification]);

  const openTrackWave = useCallback(async (track) => {
    const normalized = normalizeStoredTrack(track);
    if (!normalized) return;
    try {
      showNotification("Загружаю Мою волну по треку...", "info");
      const waveTracks = await getTrackWaveTracks(normalized, {
        likedTracks,
        dislikedTrackIds,
        dislikedTracks
      });
      if (waveTracks.length) {
        await playTrack(normalized, [normalized, ...waveTracks]);
        showNotification("Моя волна по треку запущена", "success");
      } else {
        showNotification("Не удалось загрузить волну по треку", "error");
      }
    } catch (e) {
      showNotification("Ошибка при загрузке волны по треку", "error");
    }
  }, [likedTracks, dislikedTrackIds, dislikedTracks, playTrack, showNotification]);

  const playNext = useCallback((track) => {
    const normalized = normalizeStoredTrack(track);
    if (!normalized) return;

    setQueue((currentQueue) => {
      const nextQueue = [...currentQueue];
      const existingIdx = nextQueue.findIndex((t) => t.id === normalized.id);
      if (existingIdx >= 0) {
        nextQueue.splice(existingIdx, 1);
      }
      
      const insertIndex = nextQueue.length > 0 ? currentIndex + 1 : 0;
      nextQueue.splice(insertIndex, 0, normalized);

      setOriginalQueue((orig) => {
        const nextOrig = [...orig];
        const origIdx = nextOrig.findIndex((t) => t.id === normalized.id);
        if (origIdx >= 0) nextOrig.splice(origIdx, 1);
        const origInsert = nextOrig.length > 0 ? currentIndex + 1 : 0;
        nextOrig.splice(origInsert, 0, normalized);
        return nextOrig;
      });

      return nextQueue;
    });
    showNotification("Будет воспроизведено следующим", "success");
  }, [currentIndex, showNotification]);

  const addToQueueEnd = useCallback((track) => {
    const normalized = normalizeStoredTrack(track);
    if (!normalized) return;

    setQueue((currentQueue) => {
      if (currentQueue.some((t) => t.id === normalized.id)) {
        showNotification("Трек уже в очереди", "info");
        return currentQueue;
      }
      setOriginalQueue((orig) => [...orig, normalized]);
      showNotification("Добавлено в конец очереди", "success");
      return [...currentQueue, normalized];
    });
  }, [showNotification]);

  const isCurrentLiked = likedTrackIds.has(currentTrack.id);
  const isCurrentDisliked = dislikedTrackIds.has(currentTrack.id);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaSession ||
      !window.MediaMetadata
    ) {
      return;
    }

    if (!currentTrack?.id || currentTrack.id === "empty") {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }

    const artworkUrl = getMediaArtworkUrl(currentTrack.cover);
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: currentTrack.title || "AmyMusic",
      artist: currentTrack.artist || "AmyMusic",
      album: currentTrack.mood || "AmyMusic",
      artwork: [
        { src: artworkUrl, sizes: "96x96", type: "image/png" },
        { src: artworkUrl, sizes: "256x256", type: "image/png" },
        { src: artworkUrl, sizes: "512x512", type: "image/png" }
      ]
    });
  }, [currentTrack.artist, currentTrack.cover, currentTrack.id, currentTrack.mood, currentTrack.title]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return;

    navigator.mediaSession.playbackState = currentTrack?.id === "empty"
      ? "none"
      : isPlaying
        ? "playing"
        : "paused";
  }, [currentTrack?.id, isPlaying]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaSession ||
      typeof navigator.mediaSession.setPositionState !== "function" ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return;
    }

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audioRef.current?.playbackRate || 1,
        position: Math.min(Math.max(currentTime || 0, 0), duration)
      });
    } catch (error) {
      logDebug("audio", "media session position update failed", error);
    }
  }, [currentTime, duration]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return undefined;

    const mediaSession = navigator.mediaSession;
    setMediaSessionAction(mediaSession, "play", play);
    setMediaSessionAction(mediaSession, "pause", pause);
    setMediaSessionAction(mediaSession, "previoustrack", previous);
    setMediaSessionAction(mediaSession, "nexttrack", next);
    setMediaSessionAction(mediaSession, "stop", pause);
    setMediaSessionAction(mediaSession, "seekbackward", (details = {}) => {
      seek((audioRef.current?.currentTime || currentTime || 0) - (details.seekOffset || 10));
    });
    setMediaSessionAction(mediaSession, "seekforward", (details = {}) => {
      seek((audioRef.current?.currentTime || currentTime || 0) + (details.seekOffset || 10));
    });
    setMediaSessionAction(mediaSession, "seekto", (details = {}) => {
      if (!Number.isFinite(details.seekTime)) return;
      const audio = audioRef.current;
      if (details.fastSeek && typeof audio?.fastSeek === "function") {
        audio.fastSeek(details.seekTime);
        setCurrentTime(audio.currentTime || details.seekTime);
        return;
      }
      seek(details.seekTime);
    });

    return () => {
      ["play", "pause", "previoustrack", "nexttrack", "stop", "seekbackward", "seekforward", "seekto"].forEach((action) => {
        setMediaSessionAction(mediaSession, action, null);
      });
    };
  }, [currentTime, next, pause, play, previous, seek]);

  const mergeServerData = useCallback((serverData) => {
    if (!serverData) return;
    
    if (serverData.likedTracks && Array.isArray(serverData.likedTracks)) {
      const normalizedLiked = serverData.likedTracks.map(normalizeStoredTrack).filter(Boolean);
      setLikedTracks(normalizedLiked);
      setLikedTrackIds(new Set(normalizedLiked.map(t => String(t.id))));
    }

    if (serverData.userPlaylists && Array.isArray(serverData.userPlaylists)) {
      const validPlaylists = serverData.userPlaylists.filter(p => p && p.id);
      setUserPlaylists(validPlaylists);
    }

    if (serverData.savedReleases && Array.isArray(serverData.savedReleases)) {
      const validReleases = serverData.savedReleases.filter(r => r && r.id);
      setSavedReleases(validReleases);
      setSavedReleaseIds(new Set(validReleases.map(r => String(r.id))));
    }
    
    if (serverData.dislikedTrackIds && Array.isArray(serverData.dislikedTrackIds)) {
      setDislikedTrackIds(new Set(serverData.dislikedTrackIds.map(String)));
    }
    
    if (serverData.playHistory && Array.isArray(serverData.playHistory)) {
      setPlayHistory(serverData.playHistory.map(normalizeStoredTrack).filter(Boolean));
    }

    if (typeof serverData.totalListenedSeconds === "number") {
      setTotalListenedSeconds(prev => Math.max(prev, serverData.totalListenedSeconds));
    }
  }, []);

  const cloudSyncTimeoutRef = useRef(null);
  const timeSyncTimeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (!getUsername()) return;

    if (cloudSyncTimeoutRef.current) {
      clearTimeout(cloudSyncTimeoutRef.current);
    }
    
    cloudSyncTimeoutRef.current = setTimeout(async () => {
      try {
        await Promise.all([
          syncCollections({ likedTracks, userPlaylists, savedReleases }),
          syncWave({
            dislikedTrackIds: Array.from(dislikedTrackIds),
            playHistory
          })
        ]);
        logDebug("audio", "synced collections and wave to cloud");
      } catch (e) {
        logWarn("audio", "failed to sync to cloud", e);
      }
    }, 2000);
  }, [likedTracks, userPlaylists, savedReleases, dislikedTrackIds, playHistory]);

  useEffect(() => {
    if (!getUsername()) return;

    if (timeSyncTimeoutRef.current) {
      clearTimeout(timeSyncTimeoutRef.current);
    }
    
    timeSyncTimeoutRef.current = setTimeout(async () => {
      try {
        await import("../api").then(api => api.syncTime(totalListenedSeconds));
        logDebug("audio", "synced listening time to cloud");
      } catch (e) {
        logWarn("audio", "failed to sync listening time", e);
      }
    }, 5000);
  }, [totalListenedSeconds]);

  const [profileSettings, setProfileSettings] = useState(() => getPlayerRuntimeSettings());

  useEffect(() => {
    return subscribeProfileSettings(setProfileSettings);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.amyMusicDesktop?.setDiscordActivity) {
      if (profileSettings?.discordRpcEnabled !== false && isPlaying && currentTrack) {
        window.amyMusicDesktop.setDiscordActivity({
          details: currentTrack.title || "Unknown Track",
          state: currentTrack.artist || "Unknown Artist",
          largeImageKey: currentTrack.cover || "",
          largeImageText: currentTrack.title || "AmyMusic"
        });
      } else {
        window.amyMusicDesktop.setDiscordActivity(null);
      }
    }
  }, [isPlaying, currentTrack, profileSettings?.discordRpcEnabled]);

  const controls = useMemo(
    () => [
      {
        id: "dislike",
        icon: "/dislike.svg",
        label: "Dislike",
        action: () => toggleDislike(),
        active: isCurrentDisliked
      },
      {
        id: "shuffle",
        icon: "/shuffle.svg",
        label: "Shuffle",
        action: toggleShuffle,
        active: isShuffle
      },
      { id: "previous", icon: "/prev.svg", label: "Previous", action: previous },
      {
        id: "play",
        icon: "/play.svg",
        label: isPlaying ? "Pause" : "Play",
        action: togglePlay,
        primary: true
      },
      { id: "next", icon: "/next.svg", label: "Next", action: next },
      {
        id: "repeat",
        icon: "/repeat.svg",
        label: repeatMode === "one" ? "Repeat one" : repeatMode === "playlist" ? "Repeat playlist" : "Repeat",
        action: cycleRepeatMode,
        active: repeatMode !== "off",
        badge: repeatMode === "one" ? "1" : repeatMode === "playlist" ? "\u221e" : ""
      },
      {
        id: "like",
        icon: isCurrentLiked ? "/like.svg" : "/unlike.svg",
        label: "Like",
        action: () => toggleLike(),
        active: isCurrentLiked
      }
    ],
    [
      cycleRepeatMode,
      isCurrentDisliked,
      isCurrentLiked,
      isPlaying,
      isShuffle,
      next,
      previous,
      repeatMode,
      toggleDislike,
      toggleLike,
      togglePlay,
      toggleShuffle
    ]
  );
  const clearHistory = useCallback(() => {
    setPlayHistory([]);
  }, []);

  const value = useMemo(
    () => ({
      audio: audioRef.current,
      queue,
      currentTrack,
      currentIndex,
      trackPalette,
      audioEnergy,
      isPlaying,
      isLoading,
      duration,
      currentTime,
      progress: duration > 0 ? currentTime / duration : 0,
      volume,
      effectiveVolume: isMuted ? 0 : volume,
      isMuted,
      isShuffle,
      repeatMode,
      isLiked: isCurrentLiked,
      isDisliked: isCurrentDisliked,
      likedTrackIds,
      likedTracks,
      dislikedTrackIds,
      dislikedTracks,
      playHistory,
      savedReleaseIds,
      savedReleases,
      userPlaylists,
      totalListenedSeconds,
      error,
      controls,
      play,
      pause,
      togglePlay,
      playTrack,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeatMode,
      setTracks,
      appendTracks,
      clearHistory,
      toggleLike,
      toggleDislike,
      toggleSavedRelease,
      createUserPlaylist,
      addTrackToUserPlaylist,
      updateUserPlaylist,
      removeTrackFromUserPlaylist,
      deleteUserPlaylist,
      showNotification,
      openTrackWave,
      playNext,
      addToQueueEnd,
      reorderQueue,
      reorderPlaylistTracks,
      isFullOpen,
      setIsFullOpen,
      isEqualizerOpen,
      setIsEqualizerOpen,
      isEqualizerEnabled,
      setIsEqualizerEnabled,
      equalizerGains,
      setEqualizerGain,
      equalizerPreset,
      setEqualizerPreset,
      resetEqualizer,
      mergeServerData
    }),
    [
      controls,
      audioEnergy,
      cycleRepeatMode,
      currentIndex,
      currentTime,
      currentTrack,
      trackPalette,
      duration,
      error,
      isLoading,
      isMuted,
      isPlaying,
      isCurrentLiked,
      isCurrentDisliked,
      isShuffle,
      likedTrackIds,
      likedTracks,
      dislikedTrackIds,
      dislikedTracks,
      playHistory,
      savedReleaseIds,
      savedReleases,
      next,
      pause,
      play,
      playTrack,
      previous,
      queue,
      repeatMode,
      seek,
      setTracks,
      appendTracks,
      clearHistory,
      setVolume,
      createUserPlaylist,
      addTrackToUserPlaylist,
      updateUserPlaylist,
      removeTrackFromUserPlaylist,
      deleteUserPlaylist,
      userPlaylists,
      volume,
      showNotification,
      openTrackWave,
      playNext,
      addToQueueEnd,
      removeFromQueue,
      reorderQueue,
      reorderPlaylistTracks,
      isFullOpen,
      isEqualizerOpen,
      isEqualizerEnabled,
      equalizerGains,
      setEqualizerGain,
      equalizerPreset,
      setEqualizerPreset,
      resetEqualizer,
      mergeServerData
    ]
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}

      {/* Toast Notifications System */}
      <div className="fixed top-8 left-1/2 z-[9999] flex -translate-x-1/2 flex-col gap-2 pointer-events-none">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[#121212]/80 px-5 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition-all duration-300 animate-slide-down-notify pointer-events-auto"
            style={{
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
            }}
          >
            {n.type === "success" && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-black text-emerald-400">
                ✓
              </span>
            )}
            {n.type === "info" && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-black text-purple-400">
                ✦
              </span>
            )}
            {n.type === "error" && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-black text-red-400">
                ✕
              </span>
            )}
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used inside AudioProvider");
  }
  return context;
}
