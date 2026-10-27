/**
 * Parses LRC formatted string into an array of objects
 * @param {string} lrcString 
 * @returns {Array<{time: number, text: string}>}
 */
export function parseLrc(lrcString) {
  if (!lrcString) return [];
  const lines = lrcString.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const timeInSeconds = minutes * 60 + seconds;
      const text = line.replace(timeRegex, '').trim();
      
      // Even if text is empty, it could be a pause
      result.push({ time: timeInSeconds, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}
