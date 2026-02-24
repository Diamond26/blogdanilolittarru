const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, param, query: qValidator, validationResult } = require('express-validator');
const { getPool } = require('../utils/db');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { sanitizeHTML, sanitizeText, generateSlug } = require('../middleware/security');

const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function removeLocalUploadFile(coverImagePath) {
  if (!coverImagePath || typeof coverImagePath !== 'string') return;
  if (!coverImagePath.startsWith('/uploads/')) return;

  const absPath = path.join(process.cwd(), 'public', coverImagePath.replace(/^\//, ''));
  fs.unlink(absPath, () => { });
}

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return id && id.length === 11 ? id : null;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery && byQuery.length === 11) return byQuery;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIndex = parts.findIndex(p => ['embed', 'v', 'shorts', 'live'].includes(p));
      if (markerIndex !== -1 && parts[markerIndex + 1] && parts[markerIndex + 1].length === 11) {
        return parts[markerIndex + 1];
      }
    }
  } catch (_) { }

  const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/i);
  return match ? match[1] : null;
}

function normalizeYouTubeUrl(url) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

function extractJsonObjectAfterToken(source, token) {
  const startToken = source.indexOf(token);
  if (startToken === -1) return null;

  const startBrace = source.indexOf('{', startToken + token.length);
  if (startBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startBrace; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(startBrace, i + 1);
    }
  }

  return null;
}

async function fetchYouTubeVideoMetadata(rawUrl) {
  const normalizedUrl = normalizeYouTubeUrl(rawUrl);
  if (!normalizedUrl) throw new Error('Link YouTube non valido.');
  const videoId = extractYouTubeId(normalizedUrl);

  const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`);
  if (!oembedRes.ok) throw new Error('Impossibile leggere i dati del video YouTube.');
  const oembed = await oembedRes.json();

  let title = oembed.title || '';
  let description = '';
  let thumbnail = oembed.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
  let publishedAt = null;

  try {
    const watchRes = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (watchRes.ok) {
      const html = await watchRes.text();

      const playerRespRaw = extractJsonObjectAfterToken(html, 'var ytInitialPlayerResponse =')
        || extractJsonObjectAfterToken(html, 'ytInitialPlayerResponse =');
      if (playerRespRaw) {
        try {
          const parsed = JSON.parse(playerRespRaw);
          const details = parsed?.videoDetails || {};
          const micro = parsed?.microformat?.playerMicroformatRenderer || {};

          title = details.title || micro?.title?.simpleText || title;
          description = details.shortDescription || micro?.description?.simpleText || description;
          publishedAt = micro.publishDate || micro.uploadDate || publishedAt;
          const thumbs = details?.thumbnail?.thumbnails;
          if (Array.isArray(thumbs) && thumbs.length > 0) {
            thumbnail = thumbs[thumbs.length - 1].url || thumbnail;
          }
        } catch (_) { }
      }

      const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = scriptRegex.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          const node = Array.isArray(parsed) ? parsed.find(x => x?.['@type'] === 'VideoObject') : parsed;
          if (node && node['@type'] === 'VideoObject') {
            title = node.name || title;
            description = node.description || description;
            publishedAt = node.uploadDate || node.datePublished || publishedAt;
            if (Array.isArray(node.thumbnailUrl) && node.thumbnailUrl.length > 0) thumbnail = node.thumbnailUrl[0];
            else if (typeof node.thumbnailUrl === 'string') thumbnail = node.thumbnailUrl;
            break;
          }
        } catch (_) { }
      }
    }
  } catch (_) { }

  return { url: normalizedUrl, title, description, thumbnail, publishedAt };
}

router.get('/youtube/preview', requireAdmin, [
  qValidator('url').notEmpty().isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Link YouTube non valido.' });

  try {
    const meta = await fetchYouTubeVideoMetadata(String(req.query.url || '').trim());
    return res.json({
      preview: {
        url: meta.url,
        title: meta.title || '',
        description: meta.description || '',
        thumbnail: meta.thumbnail || '',
        published_at: meta.publishedAt || null,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Impossibile caricare anteprima YouTube.' });
  }
});

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Formato immagine non supportato.'));
    }
    cb(null, true);
  },
});

// GET /api/posts — Lista post pubblicati
router.get('/', optionalAuth, [
  qValidator('page').optional().isInt({ min: 1 }).toInt(),
  qValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  qValidator('type').optional().isIn(['articolo', 'intervista']),
], async (req, res) => {
  const { type } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const offset = (page - 1) * limit;
  const isAdmin = !!req.user;
  const statusFilter = isAdmin ? '%' : 'published';

  try {
    const db = require('../utils/db').getPool();

    // Conteggio totale
    let countQuery = 'SELECT COUNT(*) as total FROM posts WHERE status LIKE ?';
    let params = [statusFilter];
    if (type) {
      countQuery += ' AND type = ?';
      params.push(type);
    }
    const [countRows] = await db.execute(countQuery, params);
    const total = countRows[0].total;

    // Lista post
    let listQuery = `
      SELECT p.*, u.email as author_email,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) as comment_count,
             (SELECT COALESCE(SUM(count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visit_count
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.status LIKE ?
    `;
    let listParams = [statusFilter];
    if (type) {
      listQuery += ' AND p.type = ?';
      listParams.push(type);
    }
    // MySQL prepared statements can fail on LIMIT/OFFSET placeholders in some environments.
    listQuery += ` ORDER BY p.published_at DESC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [posts] = await db.execute(listQuery, listParams);

    return res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET /posts error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento degli articoli.' });
  }
});

// GET /api/posts/:slug — Singolo post
router.get('/:slug', optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const isAdmin = !!req.user;
  const statusFilter = isAdmin ? '%' : 'published';
  res.set('Cache-Control', 'no-store, max-age=0');

  try {
    const db = require('../utils/db').getPool();

    // Get post
    const [postRows] = await db.execute(`
      SELECT p.*, u.email as author_email,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
             (SELECT COALESCE(SUM(count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visit_count
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.slug = ? AND p.status LIKE ?
      LIMIT 1
    `, [slug, statusFilter]);

    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
    const post = postRows[0];

    // Public article open always counts as a read.
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(`
      INSERT INTO post_visits (post_id, visit_date, count)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE count = count + 1
    `, [post.id, today]);
    post.visit_count = Number(post.visit_count || 0) + 1;

    // Get comments
    const [comments] = await db.execute(`
      SELECT id, parent_id, author_name, content, created_at
      FROM comments
      WHERE post_id = ? AND is_approved = 1
      ORDER BY created_at ASC
    `, [post.id]);

    return res.json({ post, comments });
  } catch (err) {
    console.error('GET /posts/:slug error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento dell\'articolo.' });
  }
});

// POST /api/posts — Crea articolo (admin)
router.post('/', requireAdmin,
  upload.single('cover_image'),
  [
    body('title')
      .if((_, { req }) => (req.body.type || 'articolo') !== 'intervista')
      .notEmpty()
      .isLength({ max: 500 })
      .withMessage('Titolo obbligatorio (max 500 caratteri).'),
    body('content')
      .if((_, { req }) => (req.body.type || 'articolo') !== 'intervista')
      .notEmpty()
      .withMessage('Contenuto obbligatorio.'),
    body('type').optional().isIn(['articolo', 'intervista']),
    body('status').optional().isIn(['draft', 'published']),
    body('youtube_url')
      .custom((value, { req }) => {
        const finalType = req.body.type || 'articolo';
        if (finalType !== 'intervista') return true;
        if (!value || !String(value).trim()) throw new Error('Link YouTube obbligatorio per le interviste.');
        if (!extractYouTubeId(String(value))) throw new Error('Link YouTube non valido.');
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { title, content, excerpt, youtube_url, type = 'articolo', status = 'draft' } = req.body;
    const finalType = type || 'articolo';
    let cleanTitle = sanitizeText(title || '');
    let cleanContent = '';
    let cleanExcerpt = sanitizeText(excerpt || '');
    let coverImage = req.file ? `/uploads/${req.file.filename}` : null;
    let finalStatus = status || 'draft';
    let publishedAt = finalStatus === 'published' ? new Date() : null;

    if (finalType === 'intervista') {
      const meta = await fetchYouTubeVideoMetadata(String(youtube_url || '').trim());
      cleanTitle = sanitizeText(meta.title || cleanTitle);
      cleanContent = meta.url;
      cleanExcerpt = sanitizeText(meta.description || cleanExcerpt);
      coverImage = meta.thumbnail ? sanitizeText(meta.thumbnail) : null;
      finalStatus = 'published';
      publishedAt = meta.publishedAt ? new Date(meta.publishedAt) : new Date();
      if (Number.isNaN(publishedAt.getTime())) publishedAt = new Date();

      if (req.file) removeLocalUploadFile(`/uploads/${req.file.filename}`);
    } else {
      cleanContent = sanitizeHTML(content);
    }

    let slug = generateSlug(cleanTitle);
    const db = require('../utils/db').getPool();

    try {
      const [slugRows] = await db.execute('SELECT id FROM posts WHERE slug = ? LIMIT 1', [slug]);
      if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;

      const id_uuid = uuidv4();
      const [result] = await db.execute(`
        INSERT INTO posts (uuid, author_id, type, title, slug, excerpt, content, cover_image, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id_uuid, req.user.id, finalType, cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, finalStatus, publishedAt]);

      const insertId = result.insertId;

      await db.execute(`
        INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [req.user.id, 'POST_CREATED', 'post', insertId, req.ip, JSON.stringify({ title: cleanTitle })]);

      const [newPostRows] = await db.execute('SELECT * FROM posts WHERE id = ?', [insertId]);
      return res.status(201).json({ post: newPostRows[0] });
    } catch (err) {
      console.error('POST /posts error:', err);
      return res.status(500).json({ error: 'Errore nella creazione dell\'articolo.' });
    }
  }
);

// PUT /api/posts/:id — Modifica articolo (admin)
router.put('/:id', requireAdmin,
  upload.single('cover_image'),
  [
    param('id').isInt({ min: 1 }),
    body('title').optional().isLength({ max: 500 }),
    body('type').optional().isIn(['articolo', 'intervista']),
    body('status').optional().isIn(['draft', 'published']),
    body('youtube_url')
      .optional({ values: 'falsy' })
      .custom((value) => {
        if (!value) return true;
        if (!extractYouTubeId(String(value))) throw new Error('Link YouTube non valido.');
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { id } = req.params;
    const db = require('../utils/db').getPool();

    try {
      const [existingRows] = await db.execute('SELECT * FROM posts WHERE id = ?', [id]);
      if (existingRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
      const existing = existingRows[0];

      const { title, content, excerpt, type, status, remove_cover_image, youtube_url } = req.body;
      const targetType = type || existing.type;
      let cleanTitle = title ? sanitizeText(title) : existing.title;
      let cleanContent = content ? sanitizeHTML(content) : existing.content;
      let cleanExcerpt = excerpt !== undefined ? sanitizeText(excerpt) : existing.excerpt;
      const shouldRemoveCover = remove_cover_image === '1' || remove_cover_image === 'true' || remove_cover_image === true;
      let coverImage = existing.cover_image;
      if (shouldRemoveCover) coverImage = null;
      if (req.file) coverImage = `/uploads/${req.file.filename}`;
      const newType = targetType;
      let newStatus = status || existing.status;

      let publishedAt = existing.published_at;
      if (newStatus === 'published' && !publishedAt) publishedAt = new Date();

      if (newType === 'intervista') {
        const sourceUrl = String(youtube_url || existing.content || '').trim();
        if (!extractYouTubeId(sourceUrl)) {
          return res.status(400).json({ error: 'Link YouTube obbligatorio e valido per le interviste.' });
        }

        const meta = await fetchYouTubeVideoMetadata(sourceUrl);
        cleanTitle = sanitizeText(meta.title || cleanTitle);
        cleanContent = meta.url;
        cleanExcerpt = sanitizeText(meta.description || cleanExcerpt || '');
        coverImage = meta.thumbnail ? sanitizeText(meta.thumbnail) : coverImage;
        newStatus = 'published';
        publishedAt = meta.publishedAt ? new Date(meta.publishedAt) : (publishedAt || new Date());
        if (Number.isNaN(publishedAt.getTime())) publishedAt = new Date();

        if (req.file) removeLocalUploadFile(`/uploads/${req.file.filename}`);
      }

      let slug = existing.slug;
      if (cleanTitle && cleanTitle !== existing.title) {
        slug = generateSlug(cleanTitle);
        const [slugRows] = await db.execute('SELECT id FROM posts WHERE slug = ? AND id != ? LIMIT 1', [slug, id]);
        if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;
      }

      await db.execute(`
        UPDATE posts
        SET title = ?, slug = ?, excerpt = ?, content = ?, cover_image = ?, type = ?, status = ?, published_at = ?, updated_at = NOW()
        WHERE id = ?
      `, [cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, newType, newStatus, publishedAt, id]);

      if ((shouldRemoveCover || req.file) && existing.cover_image && existing.cover_image !== coverImage) {
        removeLocalUploadFile(existing.cover_image);
      }

      await db.execute(`
        INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [req.user.id, 'POST_UPDATED', 'post', parseInt(id), req.ip, null]);

      const [updatedRows] = await db.execute('SELECT * FROM posts WHERE id = ?', [id]);
      return res.json({ post: updatedRows[0] });
    } catch (err) {
      console.error('PUT /posts/:id error:', err);
      return res.status(500).json({ error: 'Errore nell\'aggiornamento dell\'articolo.' });
    }
  }
);

// DELETE /api/posts/:id — Elimina articolo (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = require('../utils/db').getPool();

  try {
    const [existingRows] = await db.execute('SELECT * FROM posts WHERE id = ?', [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
    const post = existingRows[0];

    await db.execute('DELETE FROM posts WHERE id = ?', [id]);

    await db.execute(`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'POST_DELETED', 'post', parseInt(id), req.ip, JSON.stringify({ title: post.title })]);

    return res.json({ ok: true, message: 'Articolo eliminato.' });
  } catch (err) {
    console.error('DELETE /posts/:id error:', err);
    return res.status(500).json({ error: 'Errore nell\'eliminazione dell\'articolo.' });
  }
});

// POST /api/posts/:id/image — Upload immagine standalone
router.post('/:id/image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato.' });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

module.exports = router;
