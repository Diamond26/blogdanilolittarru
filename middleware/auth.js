const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Non autenticato.' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const db = require('../utils/db').getPool();
    const [rows] = await db.execute('SELECT id, email, role FROM users WHERE id = ? AND role = "admin" LIMIT 1', [decoded.id]);
    const user = rows[0];

    if (!user) {
      res.clearCookie('token');
      return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Token non valido o scaduto.' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const db = require('../utils/db').getPool();
      const [rows] = await db.execute('SELECT id, email, role FROM users WHERE id = ? AND role = "admin" LIMIT 1', [decoded.id]);
      const user = rows[0];
      if (user) req.user = user;
    }
  } catch (_) { }
  next();
}

module.exports = { requireAdmin, optionalAuth };
