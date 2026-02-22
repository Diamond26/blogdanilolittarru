const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { callProc, callProcOne } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
};

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
      const user = await callProcOne('sp_admin_login', [email]);

      const fakeHash = '$2a$12$invalidhashfortimingprotection1234567890';
      const passwordToCheck = user ? user.password : fakeHash;
      const isValid = await bcrypt.compare(password, passwordToCheck);

      if (!user || !isValid || user.role !== 'admin') {
        await callProc('sp_insert_admin_log', [
          null, 'LOGIN_FAILED', 'auth', null, req.ip,
          JSON.stringify({ email })
        ]);
        return res.status(401).json({ error: 'Credenziali non valide.' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.cookie('token', token, COOKIE_OPTIONS);

      await callProc('sp_insert_admin_log', [
        user.id, 'LOGIN_SUCCESS', 'auth', null, req.ip, null
      ]);

      return res.json({ ok: true, message: 'Accesso effettuato.' });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Errore interno del server.' });
    }
  }
);

// POST /api/auth/logout
router.post('/logout', requireAdmin, async (req, res) => {
  await callProc('sp_insert_admin_log', [
    req.user.id, 'LOGOUT', 'auth', null, req.ip, null
  ]);
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
  return res.json({ ok: true, message: 'Disconnesso.' });
});

// GET /api/auth/me
router.get('/me', requireAdmin, (req, res) => {
  return res.json({ id: req.user.id, email: req.user.email, role: req.user.role });
});

module.exports = router;
