const { fetchLrclib } = require('./lrclib');

async function getLyrics(artist, track) {
  console.log(`[AmyMusic:Lyrics] Fetching lyrics for ${artist} - ${track}`);
  // Try LRCLIB first
  let lrc = await fetchLrclib(artist, track);
  if (lrc) {
    console.log(`[AmyMusic:Lyrics] Found lyrics via LRCLIB for ${artist} - ${track}`);
    return lrc;
  }
  
  // Future parsers like megalobiz can be added here
  
  console.log(`[AmyMusic:Lyrics] No lyrics found for ${artist} - ${track}`);
  return null;
}

module.exports = { getLyrics };
