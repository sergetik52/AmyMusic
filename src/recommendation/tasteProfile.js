import { syncTasteProfile, getTasteProfile, getAuthToken } from '../api';
import { logDebug, logWarn } from '../utils/logger';

// Default schema for taste profile
const emptyTasteProfile = () => ({
  artists: {}, // { artist_id: { score, listens, likes, skips, lastInteraction } }
  genres: {},  // { genre_name: { score, listens, likes, skips } }
  tags: {},
  discoveryTolerance: 0.15, // Adaptive: 0.05 to 0.4
  updatedAt: 0
});

// We hold a singleton reference in memory to avoid constant disk reads
let cachedLongTermTaste = null;

// Session profile represents short-term context (e.g. recent 10-20 tracks)
export const sessionProfile = {
  recentArtists: {}, // Decays quickly
  recentGenres: {},
  fatigue: {
    artists: {}, // If an artist played too much, give penalty
    tracks: {}   // Same for tracks
  },
  moodVector: null, // If we infer mood
  recentActions: []
};

/**
 * Reset the session profile completely.
 */
export function resetSessionProfile() {
  sessionProfile.recentArtists = {};
  sessionProfile.recentGenres = {};
  sessionProfile.fatigue.artists = {};
  sessionProfile.fatigue.tracks = {};
  sessionProfile.recentActions = [];
}

/**
 * Initialize or fetch the long-term taste profile from backend/local.
 */
export async function initTasteProfile() {
  if (cachedLongTermTaste) return cachedLongTermTaste;
  
  try {
    let localData = localStorage.getItem('amymusic_tasteProfile');
    let profile = localData ? JSON.parse(localData) : emptyTasteProfile();

    if (getAuthToken()) {
      const serverProfile = await getTasteProfile();
      if (serverProfile && serverProfile.updatedAt && serverProfile.updatedAt > (profile.updatedAt || 0)) {
        profile = { ...emptyTasteProfile(), ...serverProfile };
      }
    }
    
    // Ensure all keys exist
    cachedLongTermTaste = { ...emptyTasteProfile(), ...profile };
    return cachedLongTermTaste;
  } catch (err) {
    logWarn('[TasteProfile] failed to init:', err);
    cachedLongTermTaste = emptyTasteProfile();
    return cachedLongTermTaste;
  }
}

/**
 * Save current long-term profile to backend and local storage.
 */
export function saveTasteProfile() {
  if (!cachedLongTermTaste) return;
  cachedLongTermTaste.updatedAt = Date.now();
  
  localStorage.setItem('amymusic_tasteProfile', JSON.stringify(cachedLongTermTaste));
  
  if (getAuthToken()) {
    syncTasteProfile(cachedLongTermTaste).catch(e => {
      logWarn('[TasteProfile] backend sync failed', e);
    });
  }
}

/**
 * Time decay logic for the taste profile.
 * Should be called periodically or before making a recommendation.
 */
export function applyTimeDecay() {
  if (!cachedLongTermTaste) return;
  
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  // Apply a very slow decay to artists (e.g. half-life of 90 days)
  Object.keys(cachedLongTermTaste.artists).forEach(artistId => {
    const artist = cachedLongTermTaste.artists[artistId];
    if (artist.score > 0) {
      const daysSince = (now - artist.lastInteraction) / ONE_DAY;
      if (daysSince > 10) {
         // Tiny decay
         artist.score *= Math.pow(0.99, daysSince - 10);
      }
    }
    // Remove if effectively zero
    if (Math.abs(artist.score) < 0.05 && artist.listens < 2) {
      delete cachedLongTermTaste.artists[artistId];
    }
  });

  // Session profile decays much faster (e.g. per track)
  Object.keys(sessionProfile.recentArtists).forEach(k => {
    sessionProfile.recentArtists[k] *= 0.8; 
    if (sessionProfile.recentArtists[k] < 0.1) delete sessionProfile.recentArtists[k];
  });
  Object.keys(sessionProfile.recentGenres).forEach(k => {
    sessionProfile.recentGenres[k] *= 0.8;
    if (sessionProfile.recentGenres[k] < 0.1) delete sessionProfile.recentGenres[k];
  });
}

/**
 * Helper to update a stat object like {score, listens, likes, skips}
 */
function updateStatNode(node, scoreDelta, type, now) {
  node.score = (node.score || 0) + scoreDelta;
  node.lastInteraction = now;
  if (type === 'listen') node.listens = (node.listens || 0) + 1;
  if (type === 'like') node.likes = (node.likes || 0) + 1;
  if (type === 'skip' || type === 'dislike') node.skips = (node.skips || 0) + 1;
}

/**
 * Apply feedback to the user's taste profile.
 */
export function updateProfileWithFeedback(track, weight, isLike, isDislike) {
  if (!cachedLongTermTaste || !track) return;
  
  const now = Date.now();
  const artistId = track.user?.id ? String(track.user.id) : track.artist;
  const genre = track.genre ? String(track.genre).toLowerCase().trim() : null;
  
  let type = 'listen';
  if (isLike) type = 'like';
  if (isDislike) type = 'dislike';
  if (weight < 0 && !isDislike) type = 'skip';

  // 1. Update Long-Term Artist
  if (artistId) {
    if (!cachedLongTermTaste.artists[artistId]) {
      cachedLongTermTaste.artists[artistId] = { score: 0, listens: 0, likes: 0, skips: 0, lastInteraction: now };
    }
    // Dislikes severely impact the track, but only moderately impact the artist
    const artistWeight = isDislike ? weight * 0.3 : weight; 
    updateStatNode(cachedLongTermTaste.artists[artistId], artistWeight, type, now);
  }

  // 2. Update Long-Term Genre
  if (genre) {
    if (!cachedLongTermTaste.genres[genre]) {
      cachedLongTermTaste.genres[genre] = { score: 0, listens: 0, likes: 0, skips: 0, lastInteraction: now };
    }
    // Dislike one track != dislike the whole genre
    const genreWeight = isDislike ? weight * 0.1 : (weight * 0.5);
    updateStatNode(cachedLongTermTaste.genres[genre], genreWeight, type, now);
  }

  // 3. Adapt Discovery Tolerance
  if (isLike && weight > 0) {
    // If they like something, slightly increase tolerance
    cachedLongTermTaste.discoveryTolerance = Math.min(0.4, cachedLongTermTaste.discoveryTolerance + 0.01);
  } else if ((type === 'skip' || isDislike) && weight < 0) {
    // If they skip, decrease discovery tolerance
    cachedLongTermTaste.discoveryTolerance = Math.max(0.05, cachedLongTermTaste.discoveryTolerance - 0.015);
  }

  // 4. Update Session Profile
  if (artistId) {
    sessionProfile.recentArtists[artistId] = (sessionProfile.recentArtists[artistId] || 0) + weight;
    // Track fatigue
    sessionProfile.fatigue.artists[artistId] = (sessionProfile.fatigue.artists[artistId] || 0) + 1;
  }
  if (genre) {
    sessionProfile.recentGenres[genre] = (sessionProfile.recentGenres[genre] || 0) + weight;
  }
  
  if (track.id) {
    sessionProfile.fatigue.tracks[track.id] = (sessionProfile.fatigue.tracks[track.id] || 0) + 1;
  }

  sessionProfile.recentActions.push({ trackId: track.id, weight, type, timestamp: now });
  if (sessionProfile.recentActions.length > 20) {
    sessionProfile.recentActions.shift();
  }

  // Save changes
  saveTasteProfile();
}

/**
 * Get long-term taste safely.
 */
export function getLongTermTaste() {
  if (!cachedLongTermTaste) return emptyTasteProfile();
  return cachedLongTermTaste;
}

export function getSessionProfile() {
  return sessionProfile;
}
