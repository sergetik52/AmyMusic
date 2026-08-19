/**
 * Selects the next track using controlled randomness (weighted sampling)
 * from the top-K highest scoring candidates.
 */
export function selectNextTrack(scoredCandidates, topK = 15) {
  if (!scoredCandidates || scoredCandidates.length === 0) return null;
  
  // 1. Sort by score descending
  scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);
  
  // 2. Take top K
  const pool = scoredCandidates.slice(0, topK);
  
  // Shift all scores so the minimum in the pool is slightly above 0 
  // to give everyone a chance, but higher scores much higher chance.
  const minScore = pool[pool.length - 1].finalScore;
  const shift = minScore < 0 ? Math.abs(minScore) + 1 : 0;
  
  // 3. Calculate weights and total weight
  let totalWeight = 0;
  const weights = pool.map(c => {
    // We exponentiate the score slightly to increase the gap between good and okay tracks
    // But we use a small exponent to not completely destroy randomness
    const adjusted = c.finalScore + shift;
    const weight = Math.pow(adjusted, 1.5);
    totalWeight += weight;
    return weight;
  });
  
  // 4. Sample randomly based on weight
  let randomValue = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    randomValue -= weights[i];
    if (randomValue <= 0) {
      if (window.AMY_WAVE_DEBUG) {
        console.log('[WaveEngine] Selected track:', pool[i].track.title, pool[i].reasons, 'Final Score:', pool[i].finalScore);
      }
      return pool[i].track;
    }
  }
  
  return pool[0].track; // Fallback to top if math fails
}
