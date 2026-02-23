// middleware/security.js - Sanitizzazione HTML e protezione XSS
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);

// Configurazione DOMPurify per contenuto blog
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img',
    'figure', 'figcaption', 'code', 'pre', 'hr', 'span'
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: false,
};

/**
 * Sanitizza contenuto HTML (per articoli del blog).
 * Rimuove script, attributi pericolosi, XSS vectors.
 */
function sanitizeHTML(dirty) {
  if (!dirty || typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty.trim(), PURIFY_CONFIG);
}

/**
 * Sanitizza testo semplice (commenti, nomi, titoli).
 * Rimuove qualsiasi HTML.
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return DOMPurify.sanitize(text.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Genera slug URL-safe da titolo.
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // rimuove accenti
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

/**
 * Genera fingerprint anonimo per il sistema like.
 */
function generateFingerprint(req) {
  const crypto = require('crypto');
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + ua).digest('hex');
}

module.exports = { sanitizeHTML, sanitizeText, generateSlug, generateFingerprint };
