import { getLongTermTaste, getSessionProfile } from './tasteProfile';
import { extractTrackDNA } from './trackFeatures';

export function scoreCandidate(candidateObj, currentTrack, recentHistoryIds) {
  const { track, source } = candidateObj;
  const longTermTaste = getLongTermTaste();
  const session = getSessionProfile();
  
  let score = 0;
  const reasons = {};
  
  const artistId = track.user?.id ? String(track.user.id) : track.artist;
  const genre = track.genre ? String(track.genre).toLowerCase().trim() : null;

  // 1. Long Term Affinity
  if (artistId && longTermTaste.artists[artistId]) {
    const artistScore = longTermTaste.artists[artistId].score * 2.0; // scale up
    score += artistScore;
    reasons.artistAffinity = artistScore;
  }
  
  if (genre && longTermTaste.genres[genre]) {
    const genreScore = longTermTaste.genres[genre].score * 1.5;
    score += genreScore;
    reasons.genreAffinity = genreScore;
  }

  // 2. Session Affinity (Adapts to what user listens NOW)
  if (artistId && session.recentArtists[artistId]) {
    const sessionArtistScore = session.recentArtists[artistId] * 3.0; // Very strong signal
    score += sessionArtistScore;
    reasons.sessionArtistAffinity = sessionArtistScore;
  }
  
  if (genre && session.recentGenres[genre]) {
    const sessionGenreScore = session.recentGenres[genre] * 2.5;
    score += sessionGenreScore;
    reasons.sessionGenreAffinity = sessionGenreScore;
  }

  // 3. Fatigue Penalties
  // If artist was played too many times this session
  if (artistId && session.fatigue.artists[artistId]) {
    const fatigueCount = session.fatigue.artists[artistId];
    if (fatigueCount > 2) {
      const penalty = Math.pow(fatigueCount, 1.5) * -5.0;
      score += penalty;
      reasons.artistFatigue = penalty;
    }
  }

  // 4. Repetition Penalty
  if (track.id) {
    const idx = recentHistoryIds.indexOf(String(track.id));
    if (idx !== -1) {
      // If it's recently played (idx is close to end of array = recent)
      // Wait, let's just heavily penalize if it's in the last 50 tracks
      const recency = recentHistoryIds.length - idx; 
      if (recency < 30) {
        const penalty = -100.0 / recency; // Heavy penalty if played recently
        score += penalty;
        reasons.repetitionPenalty = penalty;
      }
    }
    
    if (session.fatigue.tracks[track.id]) {
      score -= 200; // Almost never repeat the same track in one session
      reasons.trackFatigue = -200;
    }
  }

  // 5. Source Bonuses
  if (source.includes('related_current')) {
    score += 5.0; // Slightly prefer tracks naturally related to current
    reasons.relatedBonus = 5.0;
  }

  // 6. Popularity / Discovery Bonus
  const isDiscovery = !longTermTaste.artists[artistId];
  if (isDiscovery) {
    // scale by discovery tolerance
    const discoveryBonus = longTermTaste.discoveryTolerance * 20.0;
    score += discoveryBonus;
    reasons.discoveryBonus = discoveryBonus;
  }
  
  // Track DNA (basic implementation)
  const dna = extractTrackDNA(track);
  if (dna && currentTrack) {
    const currDna = extractTrackDNA(currentTrack);
    if (currDna && dna.realMetadata.genre === currDna.realMetadata.genre) {
       score += 3.0;
       reasons.dnaMatch = 3.0;
    }
  }

  return {
    track,
    finalScore: score,
    reasons
  };
}
