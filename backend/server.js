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
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
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
  db.get(`SELECT username, display_name, avatar_url, total_listen_seconds FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ 
      username: row.username, 
      displayName: row.display_name, 
      avatarUrl: row.avatar_url,
      totalListenedSeconds: row.total_listen_seconds || 0
    });
  });
});

app.post('/api/auth/profile', authenticateToken, (req, res) => {
  const { displayName, avatarUrl } = req.body;
  db.run(
    `UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?`,
    [displayName || null, avatarUrl || null, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, displayName, avatarUrl });
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
  const { absoluteSeconds } = req.body;
  if (absoluteSeconds === undefined || isNaN(absoluteSeconds)) return res.status(400).json({ error: 'Invalid seconds' });

  db.run(`UPDATE users SET total_listen_seconds = MAX(total_listen_seconds, ?) WHERE id = ?`, 
         [absoluteSeconds, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

app.get('/api/rating/top', (req, res) => {
  db.all(`SELECT username, total_listen_seconds FROM users ORDER BY total_listen_seconds DESC LIMIT 50`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

const https = require('https');
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

// --- FRONTEND STATIC SERVING ---
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
