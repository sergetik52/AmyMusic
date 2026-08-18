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
    res.json({ token, username });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(400).json({ error: 'User not found' });

    if (bcrypt.compareSync(password, row.password_hash)) {
      const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET);
      res.json({ token, username: row.username });
    } else {
      res.status(400).json({ error: 'Invalid password' });
    }
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
  const { seconds } = req.body;
  if (!seconds || isNaN(seconds)) return res.status(400).json({ error: 'Invalid seconds' });

  db.run(`UPDATE users SET total_listen_seconds = total_listen_seconds + ? WHERE id = ?`, 
         [seconds, req.user.id], (err) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("AmyMusic Backend running on port " + PORT);
});
