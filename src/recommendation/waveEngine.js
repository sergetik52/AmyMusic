import { getCandidatePool } from './candidateGenerator';
import { scoreCandidate } from './scorer';
import { selectNextTrack } from './nextTrackSelector';
import { applyTimeDecay, initTasteProfile } from './tasteProfile';

export const waveState = {
  history: [], // tracks that have been played
  currentTrack: null,
  nextTrack: null,
  reserveTrack: null, // Graceful fallback
  recentHistoryIds: [] // Rolling window for repetition penalty
};

let isPrefetching = false;
let forceInvalidate = false;
let userCollectionTracks = [];

export function setWaveUserCollection(tracks) {
  userCollectionTracks = tracks || [];
}

/**
 * Triggers re-calculation of the nextTrack.
 * Should be called when a strong signal is received (dislike, skip).
 */
export function invalidateNextTrack() {
  if (window.AMY_WAVE_DEBUG) console.log('[WaveEngine] Invalidation requested');
  forceInvalidate = true;
  prefetchNextTrack();
}

/**
 * Sets the current track to the provided track, adding the previous to history.
 */
export function setCurrentWaveTrack(track) {
  if (!track) return;
  
  if (waveState.currentTrack) {
    waveState.history.push(waveState.currentTrack);
  }
  
  waveState.currentTrack = track;
  waveState.recentHistoryIds.push(String(track.id));
  
  if (waveState.recentHistoryIds.length > 100) {
    waveState.recentHistoryIds.shift();
  }
  
  // Clear nextTrack if it just became current
  if (waveState.nextTrack && waveState.nextTrack.id === track.id) {
    waveState.nextTrack = null;
  }
  
  // Always trigger a prefetch for the next track
  prefetchNextTrack();
}

/**
 * Prefetches the next track in the background.
 */
export async function prefetchNextTrack() {
  if (isPrefetching && !forceInvalidate) return;
  
  isPrefetching = true;
  forceInvalidate = false;
  
  try {
    await initTasteProfile();
    applyTimeDecay();
    
    // Fallback logic
    if (!waveState.reserveTrack) {
       const initialPool = await getCandidatePool(waveState.currentTrack, waveState.recentHistoryIds, userCollectionTracks);
       if (initialPool.length > 0) {
         waveState.reserveTrack = initialPool[Math.floor(Math.random() * initialPool.length)].track;
       }
    }
    
    const candidates = await getCandidatePool(waveState.currentTrack, waveState.recentHistoryIds, userCollectionTracks);
    
    const scored = candidates.map(c => scoreCandidate(c, waveState.currentTrack, waveState.recentHistoryIds));
    const nextTrack = selectNextTrack(scored);
    
    // Only set it if we haven't been forcefully invalidated while fetching
    if (!forceInvalidate) {
      waveState.nextTrack = nextTrack;
      if (window.AMY_WAVE_DEBUG) console.log('[WaveEngine] Prefetched Next Track:', nextTrack?.title);
    } else {
      // Loop again if invalidated
      isPrefetching = false;
      prefetchNextTrack();
    }
    
  } catch (err) {
    console.error('[WaveEngine] Error prefetching next track', err);
  } finally {
    isPrefetching = false;
  }
}

/**
 * Gets the next track to play. Returns null if not ready (or gracefully falls back).
 */
export async function consumeNextWaveTrack() {
  if (forceInvalidate || !waveState.nextTrack) {
     // Await the prefetch if it's running or missing
     await prefetchNextTrack();
  }
  
  if (waveState.nextTrack) {
    return waveState.nextTrack;
  }
  
  return waveState.reserveTrack;
}

export function goBackWaveHistory() {
  if (waveState.history.length === 0) return null;
  const prev = waveState.history.pop();
  waveState.nextTrack = waveState.currentTrack; // The current becomes the next
  waveState.currentTrack = prev;
  return prev;
}
