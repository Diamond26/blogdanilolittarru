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
  const { page = 1, limit = 10, type } = req.query;
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
    listQuery += ' ORDER BY p.published_at DESC, p.created_at DESC LIMIT ? OFFSET ?';
    listParams.push(limit, offset);

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

    // Increment visits
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(`
      INSERT INTO post_visits (post_id, visit_date, count)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE count = count + 1
    `, [post.id, today]);

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
    const db = require('../utils/db').getPool();

    try {
      const [slugRows] = await db.execute('SELECT id FROM posts WHERE slug = ? LIMIT 1', [slug]);
      if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;

      const id_uuid = uuidv4();
      const publishedAt = status === 'published' ? new Date() : null;

      const [result] = await db.execute(`
        INSERT INTO posts (uuid, author_id, type, title, slug, excerpt, content, cover_image, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id_uuid, req.user.id, type, cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, status, publishedAt]);

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
        const [slugRows] = await db.execute('SELECT id FROM posts WHERE slug = ? AND id != ? LIMIT 1', [slug, id]);
        if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;
      }

      await db.execute(`
        UPDATE posts
        SET title = ?, slug = ?, excerpt = ?, content = ?, cover_image = ?, type = ?, status = ?, published_at = ?, updated_at = NOW()
        WHERE id = ?
      `, [cleanTitle, slug, cleanExcerpt, cleanContent, coverImage, newType, newStatus, publishedAt, id]);

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
