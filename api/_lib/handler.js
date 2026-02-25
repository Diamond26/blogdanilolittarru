const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function createHandler(methods) {
  return async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const fn = methods[req.method];
    if (!fn) return res.status(405).json({ error: 'Metodo non consentito.' });

    try {
      await fn(req, res);
    } catch (err) {
      console.error(`[${req.method}] ${req.url} error:`, err);
      res.status(500).json({ error: 'Errore interno del server.' });
    }
  };
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

module.exports = { createHandler, setCors, getClientIp };
