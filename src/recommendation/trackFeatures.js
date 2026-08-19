import { getRelatedArtists } from '../services/soundCloudApi';

export function extractTrackDNA(track) {
  if (!track) return null;
  
  // Real metadata
  const realGenre = track.genre || track.mood || '';
  const tags = track.tags || [];
  const playbackCount = track.playbackCount || 0;
  const likesCount = track.likesCount || 0;
  const duration = track.duration || 0;
  const isSnippet = track.isSnippet || false;

  // Inferred features
  const inferredMood = {
    dark: { value: 0, confidence: 0 },
    aggressive: { value: 0, confidence: 0 },
    energetic: { value: 0, confidence: 0 }
  };

  const textToAnalyze = `${track.title} ${realGenre} ${tags.join(' ')}`.toLowerCase();
  
  // Very weak heuristics based on text
  if (textToAnalyze.includes('phonk') || textToAnalyze.includes('dark') || textToAnalyze.includes('underground')) {
    inferredMood.dark.value = 0.8;
    inferredMood.dark.confidence = 0.4; // Low confidence
  }
  
  if (textToAnalyze.includes('trap') || textToAnalyze.includes('hard') || textToAnalyze.includes('bass')) {
    inferredMood.aggressive.value = 0.7;
    inferredMood.aggressive.confidence = 0.3;
  }
  
  if (textToAnalyze.includes('edm') || textToAnalyze.includes('dance') || textToAnalyze.includes('house')) {
    inferredMood.energetic.value = 0.9;
    inferredMood.energetic.confidence = 0.5;
  }

  return {
    realMetadata: {
      genre: realGenre,
      tags,
      playbackCount,
      likesCount,
      duration,
      isSnippet
    },
    inferredFeatures: inferredMood
  };
}

// Check if two tracks are similar using DNA
export function calculateTrackSimilarity(dnaA, dnaB) {
  if (!dnaA || !dnaB) return 0;
  
  let score = 0;
  
  if (dnaA.realMetadata.genre && dnaA.realMetadata.genre === dnaB.realMetadata.genre) {
    score += 0.5; // High confidence match
  }
  
  const tagsA = new Set(dnaA.realMetadata.tags);
  let tagMatches = 0;
  for (const tag of dnaB.realMetadata.tags) {
    if (tagsA.has(tag)) tagMatches++;
  }
  
  if (tagMatches > 0) {
    score += Math.min(0.3, tagMatches * 0.1);
  }
  
  return score;
}
