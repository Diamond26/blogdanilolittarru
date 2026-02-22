'use strict';

if (process.env.NODE_ENV !== 'production') {
  try {
    const fs = require('fs'), path = require('path');
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const idx = t.indexOf('=');
        if (idx === -1) return;
        const k = t.slice(0, idx).trim();
        const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (k && !process.env[k]) process.env[k] = v;
      });
    }
  } catch (_) { }
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { callProc } = require('../utils/db');

const app = express();

// ═══════════════════════════════════════
// SECURITY HEADERS (Helmet)
// ═══════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://img.youtube.com', 'https://i.ytimg.com'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// ═══════════════════════════════════════
// CORS
// ═══════════════════════════════════════
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origin non consentita dalla policy CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// ═══════════════════════════════════════
// BODY PARSING
// ═══════════════════════════════════════
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// ═══════════════════════════════════════
// CSRF PROTECTION (Double Submit Cookie)
// ═══════════════════════════════════════
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    if (!req.cookies['csrf-token']) {
      const token = crypto.randomUUID();
      res.cookie('csrf-token', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });
    }
    return next();
  }

  if (req.path.startsWith('/api')) {
    const cookieToken = req.cookies['csrf-token'];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ error: 'Token CSRF non valido.' });
    }
  }
  next();
});

// ═══════════════════════════════════════
// CONTATORE VISITE SITO (stored procedure)
// ═══════════════════════════════════════
app.use(async (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await callProc('sp_increment_site_visits', [today]);
    } catch (_) { }
  }
  next();
});

// ═══════════════════════════════════════
// STATIC FILES
// ═══════════════════════════════════════
const publicDir = path.join(process.cwd(), 'public');
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));
app.use(express.static(publicDir));

// ═══════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════
app.use('/api/auth', require('../routes/auth'));
app.use('/api/posts', require('../routes/posts'));
app.use('/api/comments', require('../routes/comments'));
app.use('/api/likes', require('../routes/likes'));
app.use('/api/contacts', require('../routes/contacts'));
app.use('/api/admin', require('../routes/admin'));

// ═══════════════════════════════════════
// SPA FALLBACK (Admin nascosto)
// ═══════════════════════════════════════
app.get('/admin', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ═══════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File troppo grande (max 5MB).' });
  }
  res.status(500).json({ error: 'Errore interno del server.' });
});

// ═══════════════════════════════════════
// START (solo in locale, non su Vercel)
// ═══════════════════════════════════════
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🧠 Danilo Littarru — Server avviato su http://localhost:${PORT}`);
    console.log(`📋 Admin dashboard: http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
