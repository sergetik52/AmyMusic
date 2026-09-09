const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'amymusic-super-secret-key';

// Middleware for authentication
const DEFAULT_PRIVACY = {
  showCollection: 'everyone', // 'everyone' | 'friends' | 'nobody'
  showLikes: 'everyone',      // 'everyone' | 'friends' | 'nobody'
  showOnline: 'everyone',     // 'everyone' | 'friends' | 'nobody'
  allowFriends: 'everyone',   // 'everyone' | 'nobody'
  allowTrackSharing: 'everyone' // 'everyone' | 'friends' | 'nobody'
};

function parseSqliteDate(dateStr) {
  if (!dateStr) return 0;
  const isoStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const time = new Date(isoStr).getTime();
  return isNaN(time) ? 0 : time;
}

function parsePrivacy(jsonStr) {
  if (!jsonStr) return DEFAULT_PRIVACY;
  try {
    return { ...DEFAULT_PRIVACY, ...JSON.parse(jsonStr) };
  } catch {
    return DEFAULT_PRIVACY;
  }
}

const https = require('https');

function syncRemoteTopUsers() {
  https.get('https://amymusic.ru/api/rating/top', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const topList = JSON.parse(data);
        if (Array.isArray(topList)) {
          topList.forEach(u => {
            const secs = u.total_listen_seconds || u.totalListenedSeconds || 0;
            if (u.username) {
              db.run(
                `INSERT INTO users (username, password_hash, display_name, total_listen_seconds) 
                 VALUES (?, 'remote_hash', ?, ?)
                 ON CONFLICT(username) DO UPDATE SET total_listen_seconds = MAX(total_listen_seconds, excluded.total_listen_seconds)`,
                [u.username, u.username, secs],
                () => {}
              );
            }
          });
        }
      } catch (e) {}
    });
  }).on('error', () => {});
}

// Sync on startup and every 2 minutes
syncRemoteTopUsers();
setInterval(syncRemoteTopUsers, 120000);

function ensureUser(userPayload) {
  return new Promise((resolve) => {
    if (!userPayload || !userPayload.username) return resolve(null);
    db.get(`SELECT * FROM users WHERE username = ?`, [userPayload.username], (err, row) => {
      if (row) {
        userPayload.id = row.id;
        return resolve(row);
      }
      db.run(
        `INSERT INTO users (username, password_hash, display_name) VALUES (?, 'remote_hash', ?)
         ON CONFLICT(username) DO NOTHING`,
        [userPayload.username, userPayload.username],
        function () {
          db.get(`SELECT * FROM users WHERE username = ?`, [userPayload.username], (_, newRow) => {
            if (newRow) userPayload.id = newRow.id;
            resolve(newRow || null);
          });
        }
      );
    });
  });
}

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    await ensureUser(req.user);
    db.run(`UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`, [req.user.id], () => {});
    next();
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    jwt.verify(token, JWT_SECRET, async (err, user) => {
      if (!err && user) {
        req.user = user;
        await ensureUser(req.user);
        db.run(`UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`, [user.id], () => {});
      }
      next();
    });
  } else {
    next();
  }
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const hash = bcrypt.hashSync(password, 10);
  
  db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hash], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }
    const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET);
    res.json({ token, username, displayName: null, avatarUrl: null });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(400).json({ error: 'User not found' });

    if (bcrypt.compareSync(password, row.password_hash)) {
      const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET);
      res.json({ token, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url });
    } else {
      res.status(400).json({ error: 'Invalid password' });
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get(`SELECT username, display_name, avatar_url, bio, total_listen_seconds, privacy_settings FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ 
      username: row.username, 
      displayName: row.display_name, 
      avatarUrl: row.avatar_url,
      bio: row.bio || '',
      totalListenedSeconds: row.total_listen_seconds || 0,
      privacySettings: parsePrivacy(row.privacy_settings)
    });
  });
});

app.post('/api/auth/profile', authenticateToken, (req, res) => {
  const { displayName, avatarUrl, bio } = req.body;
  db.run(
    `UPDATE users SET display_name = ?, avatar_url = ?, bio = ? WHERE id = ?`,
    [displayName || null, avatarUrl || null, bio !== undefined ? bio : null, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, displayName, avatarUrl, bio });
    }
  );
});

app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите старый и новый пароль' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Новый пароль слишком короткий (минимум 4 символа)' });
  }

  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
      return res.status(400).json({ error: 'Неверный текущий пароль' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.user.id], (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, message: 'Пароль успешно изменён' });
    });
  });
});

// --- PRIVACY SETTINGS ---
app.get('/api/users/privacy', authenticateToken, (req, res) => {
  db.get(`SELECT privacy_settings FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(parsePrivacy(row?.privacy_settings));
  });
});

// --- SYNC ROUTES ---
app.get('/api/sync/collections', authenticateToken, (req, res) => {
  db.get(`SELECT data FROM collections WHERE user_id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) {
      res.json(JSON.parse(row.data));
    } else {
      res.json({});
    }
  });
});

app.post('/api/sync/collections', authenticateToken, (req, res) => {
  const data = JSON.stringify(req.body);
  db.run(`INSERT INTO collections (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`, 
          [req.user.id, data], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

app.get('/api/sync/wave', authenticateToken, (req, res) => {
  db.get(`SELECT data FROM wave_history WHERE user_id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) {
      res.json(JSON.parse(row.data));
    } else {
      res.json({});
    }
  });
});

app.post('/api/sync/wave', authenticateToken, (req, res) => {
  const data = JSON.stringify(req.body);
  db.run(`INSERT INTO wave_history (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`, 
          [req.user.id, data], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

// --- RATING / LISTENING TRACKING ---
app.post('/api/track/listen', authenticateToken, (req, res) => {
  const { absoluteSeconds, seconds } = req.body;
  const secs = absoluteSeconds !== undefined ? absoluteSeconds : seconds;
  if (secs === undefined || isNaN(secs)) return res.status(400).json({ error: 'Invalid seconds' });

  db.run(`UPDATE users SET total_listen_seconds = MAX(total_listen_seconds, ?) WHERE id = ?`, 
         [secs, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

app.get('/api/rating/top', optionalAuthenticateToken, (req, res) => {
  const currentUserId = req.user?.id;
  db.all(
    `SELECT id, username, display_name, avatar_url, total_listen_seconds, last_seen, privacy_settings 
     FROM users 
     ORDER BY total_listen_seconds DESC 
     LIMIT 50`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      
      const now = Date.now();
      const results = rows.map((u, index) => {
        const privacy = parsePrivacy(u.privacy_settings);
        const lastSeenTime = parseSqliteDate(u.last_seen);
        const isOnline = (now - lastSeenTime < 3 * 60 * 1000) && privacy.showOnline !== 'nobody';

        return {
          rank: index + 1,
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          avatarUrl: u.avatar_url,
          totalListenedSeconds: u.total_listen_seconds || 0,
          isOnline: isOnline && (privacy.showOnline === 'everyone' || (privacy.showOnline === 'friends' && currentUserId))
        };
      });
      res.json(results);
    }
  );
});

const path = require('path');

// --- SOUNDCLOUD API PROXY (For Web Browser Deployment) ---
app.use('/api/soundcloud', (req, res) => {
  try {
    const upstreamUrl = new URL(req.url, 'https://api-v2.soundcloud.com');
    upstreamUrl.searchParams.delete('_auth');
    upstreamUrl.searchParams.delete('_client_secret');
    upstreamUrl.searchParams.delete('_proxies');

    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        host: 'api-v2.soundcloud.com',
        accept: 'application/json, text/plain, */*',
        'accept-encoding': 'identity',
        origin: 'https://soundcloud.com',
        referer: 'https://soundcloud.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    };

    const proxyReq = https.request(upstreamUrl, options, (proxyRes) => {
      res.statusCode = proxyRes.statusCode;
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      res.setHeader('access-control-allow-origin', '*');
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[AmyMusic SoundCloud Proxy Error]:', err.message);
      res.status(502).json({ error: 'SOUNDCLOUD_PROXY_ERROR', message: err.message });
    });

    if (req.body && Object.keys(req.body).length) {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  } catch (err) {
    res.status(500).json({ error: 'PROXY_INTERNAL_ERROR', message: err.message });
  }
});

// --- DOWNLOADS & AUTO-UPDATE ROUTES ---
let pkgInfo = { version: '0.1.1' };
try {
  pkgInfo = require('./package.json');
} catch (e) {
  try {
    pkgInfo = require('../package.json');
  } catch (e2) {}
}

app.get('/api/app-version', (req, res) => {
  const version = pkgInfo.version || '0.1.1';
  const fileName = `AmyMusic-${version}-Setup.exe`;
  const githubDownloadUrl = `https://github.com/sergetik52/AmyMusic/releases/download/v${version}/${fileName}`;

  res.json({
    version,
    downloadUrl: githubDownloadUrl,
    fileName,
    releaseNotes: `Версия v${version}: Официальное автообновление через GitHub, 10-полосный эквалайзер и оптимизация веб-версии.`
  });
});

app.get('/api/download-app', (req, res) => {
  const version = pkgInfo.version || '0.1.1';
  const fileName = `AmyMusic-${version}-Setup.exe`;
  res.redirect(`https://github.com/sergetik52/AmyMusic/releases/download/v${version}/${fileName}`);
});

// --- DOWNLOADS & FRONTEND STATIC SERVING ---
const downloadsPath = path.join(__dirname, '../downloads');
app.use('/downloads', express.static(downloadsPath));

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/downloads/')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("AmyMusic Backend running on port " + PORT);
});
