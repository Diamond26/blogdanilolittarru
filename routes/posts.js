// routes/posts.js - CRUD articoli e interviste
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, param, query: qValidator, validationResult } = require('express-validator');
const { query, queryOne } = require('../utils/db');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { sanitizeHTML, sanitizeText, generateSlug } = require('../middleware/security');

// Upload immagini
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Formato immagine non supportato.'));
    }
    cb(null, true);
  },
});

// ──────────────────────────────────────────
// GET /api/posts - Lista post pubblicati
// ──────────────────────────────────────────
router.get('/', optionalAuth, [
  qValidator('page').optional().isInt({ min: 1 }).toInt(),
  qValidator('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  qValidator('type').optional().isIn(['articolo', 'intervista']),
], async (req, res) => {
  const { page = 1, limit = 10, type } = req.query;
  const offset = (page - 1) * limit;
  const isAdmin = !!req.user;

  try {
    const statusFilter = isAdmin ? '' : "AND p.status = 'published'";
    const typeFilter = type ? 'AND p.type = ?' : '';
    const params = [limit, offset];
    if (type) params.splice(0, 0, type);

    const countParams = type ? [type] : [];
    const countTypeFilter = type ? 'AND type = ?' : '';
    const statusCountFilter = isAdmin ? '' : "AND status = 'published'";

    const [totalRow] = await query(
      `SELECT COUNT(*) AS total FROM posts WHERE 1=1 ${statusCountFilter} ${countTypeFilter}`,
      countParams
    );

    const sqlParams = type ? [type, limit, offset] : [limit, offset];
    const posts = await query(
      `SELECT p.id, p.uuid, p.type, p.title, p.slug, p.excerpt,
              p.cover_image, p.status, p.published_at, p.created_at,
              u.email AS author_email,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COALESCE(SUM(pv.count),0) FROM post_visits pv WHERE pv.post_id = p.id) AS visit_count,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comment_count
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE 1=1 ${statusFilter} ${typeFilter}
       ORDER BY p.published_at DESC, p.created_at DESC
       LIMIT ? OFFSET ?`,
      sqlParams
    );

    return res.json({
      posts,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        pages: Math.ceil(totalRow.total / limit),
      },
    });
  } catch (err) {
    console.error('GET /posts error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento degli articoli.' });
  }
});

// ──────────────────────────────────────────
// GET /api/posts/:slug - Singolo post
// ──────────────────────────────────────────
router.get('/:slug', optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const isAdmin = !!req.user;

  try {
    const statusFilter = isAdmin ? '' : "AND p.status = 'published'";
    const post = await queryOne(
      `SELECT p.*, u.email AS author_email,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COALESCE(SUM(pv.count),0) FROM post_visits pv WHERE pv.post_id = p.id) AS visit_count
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.slug = ? ${statusFilter}`,
      [slug]
    );

    if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

    // Conta visita
    const today = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO post_visits (post_id, visit_date, count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [post.id, today]
    );

    // Commenti approvati con risposte
    const comments = await query(
      `SELECT id, parent_id, author_name, content, created_at
       FROM comments
       WHERE post_id = ? AND is_approved = 1
       ORDER BY created_at ASC`,
      [post.id]
    );

    return res.json({ post, comments });
  } catch (err) {
    console.error('GET /posts/:slug error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento dell\'articolo.' });
  }
});

// ──────────────────────────────────────────
// POST /api/posts - Crea articolo (admin)
// ──────────────────────────────────────────
router.post('/', requireAdmin,
  upload.single('cover_image'),
  [
    body('title').notEmpty().isLength({ max: 500 }).withMessage('Titolo obbligatorio (max 500 caratteri).'),
    body('content').notEmpty().withMessage('Contenuto obbligatorio.'),
    body('type').optional().isIn(['articolo', 'intervista']),
    body('status').optional().isIn(['draft', 'published']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { title, content, excerpt, type = 'articolo', status = 'draft' } = req.body;
    const cleanTitle = sanitizeText(title);
    const cleanContent = sanitizeHTML(content);
    const cleanExcerpt = sanitizeText(excerpt || '');
    const coverImage = req.file ? `/uploads/${req.file.filename}` : null;

    let slug = generateSlug(cleanTitle);
    // Slug univocità
    const existing = await queryOne('SELECT id FROM posts WHERE slug = ?', [slug]);
    if (existing) slug = `${slug}-${Date.now()}`;

    const id_uuid = uuidv4();
    const publishedAt = status === 'published' ? new Date() : null;

    try {
      const result = await query(
        `INSERT INTO posts (uuid, author_id, type, title, slug, excerpt, content, cover_image, status, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_uuid, req.user.id, type, cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, status, publishedAt]
      );

      await query(
        'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, 'POST_CREATED', 'post', result.insertId, req.ip, JSON.stringify({ title: cleanTitle })]
      );

      const newPost = await queryOne('SELECT * FROM posts WHERE id = ?', [result.insertId]);
      return res.status(201).json({ post: newPost });
    } catch (err) {
      console.error('POST /posts error:', err);
      return res.status(500).json({ error: 'Errore nella creazione dell\'articolo.' });
    }
  }
);

// ──────────────────────────────────────────
// PUT /api/posts/:id - Modifica articolo (admin)
// ──────────────────────────────────────────
router.put('/:id', requireAdmin,
  upload.single('cover_image'),
  [
    param('id').isInt({ min: 1 }),
    body('title').optional().isLength({ max: 500 }),
    body('type').optional().isIn(['articolo', 'intervista']),
    body('status').optional().isIn(['draft', 'published']),
  ],
  async (req, res) => {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM posts WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Articolo non trovato.' });

    const { title, content, excerpt, type, status } = req.body;
    const cleanTitle = title ? sanitizeText(title) : existing.title;
    const cleanContent = content ? sanitizeHTML(content) : existing.content;
    const cleanExcerpt = excerpt !== undefined ? sanitizeText(excerpt) : existing.excerpt;
    const coverImage = req.file ? `/uploads/${req.file.filename}` : existing.cover_image;
    const newType = type || existing.type;
    const newStatus = status || existing.status;

    let publishedAt = existing.published_at;
    if (newStatus === 'published' && !publishedAt) publishedAt = new Date();

    let slug = existing.slug;
    if (title && sanitizeText(title) !== existing.title) {
      slug = generateSlug(cleanTitle);
      const slugCheck = await queryOne('SELECT id FROM posts WHERE slug = ? AND id != ?', [slug, id]);
      if (slugCheck) slug = `${slug}-${Date.now()}`;
    }

    try {
      await query(
        `UPDATE posts SET title=?, slug=?, excerpt=?, content=?, cover_image=?,
         type=?, status=?, published_at=?, updated_at=NOW()
         WHERE id=?`,
        [cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, newType, newStatus, publishedAt, id]
      );

      await query(
        'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'POST_UPDATED', 'post', id, req.ip]
      );

      const updated = await queryOne('SELECT * FROM posts WHERE id = ?', [id]);
      return res.json({ post: updated });
    } catch (err) {
      console.error('PUT /posts/:id error:', err);
      return res.status(500).json({ error: 'Errore nell\'aggiornamento dell\'articolo.' });
    }
  }
);

// ──────────────────────────────────────────
// DELETE /api/posts/:id - Elimina articolo (admin)
// ──────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const post = await queryOne('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  try {
    await query('DELETE FROM posts WHERE id = ?', [id]);
    await query(
      'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, 'POST_DELETED', 'post', id, req.ip, JSON.stringify({ title: post.title })]
    );
    return res.json({ ok: true, message: 'Articolo eliminato.' });
  } catch (err) {
    console.error('DELETE /posts/:id error:', err);
    return res.status(500).json({ error: 'Errore nell\'eliminazione dell\'articolo.' });
  }
});

// ──────────────────────────────────────────
// POST /api/posts/:id/image - Upload immagine standalone
// ──────────────────────────────────────────
router.post('/:id/image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato.' });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

module.exports = router;
