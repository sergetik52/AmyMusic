export const FEEDBACK_WEIGHTS = {
  LIKE: 5.0,
  REPLAY: 4.0,
  LISTEN_FULL: 3.0,     // >= 90%
  LISTEN_MOST: 2.0,     // >= 70%
  LISTEN_SOME: 0.5,     // >= 40%
  SKIP_QUICK: -4.0,     // < 10s
  SKIP_EARLY: -3.0,     // < 25%
  SKIP_MID: -1.0,       // < 50%
  SKIP_LATE: 0.0,       // > 60%
  DISLIKE: -6.0,
  PREVIOUS: 2.0         // User goes back to a track
};

/**
 * Calculates feedback weight based on listen time and track duration.
 */
export function calculateImplicitFeedback(listenSeconds, trackDuration, isSkipped, isManualNext) {
  if (!trackDuration || trackDuration === 0) return 0;
  
  const percentage = (listenSeconds / trackDuration) * 100;
  
  if (isSkipped) {
    if (listenSeconds < 10) return FEEDBACK_WEIGHTS.SKIP_QUICK;
    if (percentage < 25) return FEEDBACK_WEIGHTS.SKIP_EARLY;
    if (percentage < 50) return FEEDBACK_WEIGHTS.SKIP_MID;
    return FEEDBACK_WEIGHTS.SKIP_LATE;
  }
  
  if (percentage >= 90) return FEEDBACK_WEIGHTS.LISTEN_FULL;
  if (percentage >= 70) return FEEDBACK_WEIGHTS.LISTEN_MOST;
  if (percentage >= 40) return FEEDBACK_WEIGHTS.LISTEN_SOME;
  
  // If it wasn't strictly skipped, but user went Next manually early
  if (isManualNext) {
    if (listenSeconds < 10) return FEEDBACK_WEIGHTS.SKIP_QUICK;
    if (percentage < 25) return FEEDBACK_WEIGHTS.SKIP_EARLY;
    if (percentage < 50) return FEEDBACK_WEIGHTS.SKIP_MID;
  }
  
  return 0; // Neutral
}
