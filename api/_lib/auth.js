const jwt = require('jsonwebtoken');
const { sql } = require('@vercel/postgres');

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [name, ...rest] = c.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function getToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.token || null;
}

async function getUser(req) {
  const token = getToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await sql`SELECT id, email, role FROM users WHERE id = ${decoded.id} AND role = 'admin' LIMIT 1`;
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAdmin(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Non autorizzato.' });
    return null;
  }
  return user;
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `token=${token}`,
    'HttpOnly',
    secure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${8 * 3600}`,
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
}

module.exports = { parseCookies, getToken, getUser, requireAdmin, setAuthCookie, clearAuthCookie };
