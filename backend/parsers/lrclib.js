const https = require('https');

function fetchLrclib(artist, track) {
  return new Promise((resolve, reject) => {
    if (!artist || !track) return resolve(null);
    const query = encodeURIComponent(`${track} ${artist}`);
    const url = `https://lrclib.net/api/search?q=${query}`;
    
    const req = https.get(url, {
      timeout: 3500,
      headers: {
        'User-Agent': 'AmyMusic/0.1 (https://github.com/sergetik52/AmyMusic)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (Array.isArray(results) && results.length > 0) {
            // Find best match with synced lyrics
            const synced = results.find(r => r.syncedLyrics);
            if (synced) {
              return resolve(synced.syncedLyrics);
            }
            // fallback to unsynced
            const unsynced = results.find(r => r.plainLyrics);
            if (unsynced) {
              return resolve(unsynced.plainLyrics);
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    
    req.on('error', (e) => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

module.exports = { fetchLrclib };
