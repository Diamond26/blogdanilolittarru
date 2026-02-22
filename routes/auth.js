// routes/auth.js - Login e logout admin
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { queryOne, query } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000, // 8 ore
  path: '/',
};

// Rate limiting per login: max 5 tentativi per 15 minuti per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email non valida.'),
    body('password').isLength({ min: 6 }).withMessage('Password troppo corta.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    try {
      const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);

      // Timing attack protection: esegui compare anche se user non esiste
      const fakeHash = '$2a$12$invalidhashfortimingprotection1234567890';
      const passwordToCheck = user ? user.password : fakeHash;
      const isValid = await bcrypt.compare(password, passwordToCheck);

      if (!user || !isValid || user.role !== 'admin') {
        // Log tentativo fallito
        await query(
          'INSERT INTO admin_logs (action, entity_type, ip_address, details) VALUES (?, ?, ?, ?)',
          ['LOGIN_FAILED', 'auth', req.ip, JSON.stringify({ email })]
        );
        return res.status(401).json({ error: 'Credenziali non valide.' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.cookie('token', token, COOKIE_OPTIONS);

      // Log accesso
      await query(
        'INSERT INTO admin_logs (user_id, action, entity_type, ip_address) VALUES (?, ?, ?, ?)',
        [user.id, 'LOGIN_SUCCESS', 'auth', req.ip]
      );

      return res.json({ ok: true, message: 'Accesso effettuato.' });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Errore interno del server.' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', requireAdmin, async (req, res) => {
  await query(
    'INSERT INTO admin_logs (user_id, action, entity_type, ip_address) VALUES (?, ?, ?, ?)',
    [req.user.id, 'LOGOUT', 'auth', req.ip]
  );
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
  return res.json({ ok: true, message: 'Disconnesso.' });
});

// GET /api/auth/me
router.get('/me', requireAdmin, (req, res) => {
  return res.json({ id: req.user.id, email: req.user.email, role: req.user.role });
});

module.exports = router;
