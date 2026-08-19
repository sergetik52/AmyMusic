import { getTrackWaveTracks, getRecommendedTracks, searchTracks } from '../services/soundCloudApi';
import { getLongTermTaste, getSessionProfile } from './tasteProfile';

// Cache candidate pools to avoid hitting SoundCloud too often
const candidateCache = {
  pools: new Map(), // { key -> { candidates, expiresAt } }
};

const TTL_MS = 1000 * 60 * 15; // 15 mins

/**
 * Fetch and combine tracks from multiple sources.
 */
export async function getCandidatePool(currentTrack, recentHistory) {
  const candidates = new Map(); // deduplicate by track.id
  
  const longTermTaste = getLongTermTaste();
  const session = getSessionProfile();
  
  const addCandidates = (tracks, sourceLabel) => {
    (tracks || []).forEach(t => {
      if (!t || !t.id) return;
      if (!candidates.has(t.id)) {
        candidates.set(t.id, { track: t, source: [sourceLabel] });
      } else {
        candidates.get(t.id).source.push(sourceLabel);
      }
    });
  };

  const tasks = [];

  // 1. Related to Current Track (Primary source)
  if (currentTrack?.id) {
    tasks.push(
      fetchCached(`related:${currentTrack.id}`, () => getTrackWaveTracks(currentTrack))
        .then(res => addCandidates(res, 'related_current'))
        .catch(() => {})
    );
  }

  // 2. Favorite artist search (if tolerance is low or no current track)
  const topArtists = Object.entries(longTermTaste.artists)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(x => x[0]); // ID or name
    
  if (topArtists.length > 0) {
    const randomArtist = topArtists[Math.floor(Math.random() * topArtists.length)];
    tasks.push(
      fetchCached(`search:artist:${randomArtist}`, () => searchTracks(randomArtist))
        .then(res => addCandidates(res, 'favorite_artist'))
        .catch(() => {})
    );
  }

  // 3. Fallback to general recommended
  if (tasks.length === 0) {
    tasks.push(
      fetchCached('recommended:home', () => getRecommendedTracks())
        .then(res => addCandidates(res, 'recommended'))
        .catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
  
  return Array.from(candidates.values());
}

async function fetchCached(key, fetcher) {
  const cached = candidateCache.pools.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.candidates;
  }
  
  const results = await fetcher();
  
  // Save cache
  candidateCache.pools.set(key, {
    candidates: results,
    expiresAt: Date.now() + TTL_MS
  });
  
  // Cleanup old cache
  if (candidateCache.pools.size > 50) {
    const firstKey = candidateCache.pools.keys().next().value;
    candidateCache.pools.delete(firstKey);
  }
  
  return results;
}
