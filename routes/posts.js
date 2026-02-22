const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, param, query: qValidator, validationResult } = require('express-validator');
const { callProc, callProcOne } = require('../utils/db');
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
  const publishedOnly = isAdmin ? 0 : 1;

  try {
    const countResult = await callProc('sp_get_posts_count', [type || null, publishedOnly]);
    const totalRow = Array.isArray(countResult[0]) ? countResult[0][0] : countResult[0];

    const postsResult = await callProc('sp_get_posts_list', [type || null, publishedOnly, limit, offset]);
    const posts = Array.isArray(postsResult[0]) ? postsResult[0] : postsResult;

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

// GET /api/posts/:slug — Singolo post
router.get('/:slug', optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const isAdmin = !!req.user;
  const publishedOnly = isAdmin ? 0 : 1;

  try {
    const post = await callProcOne('sp_get_post_by_slug', [slug, publishedOnly]);
    if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

    const today = new Date().toISOString().slice(0, 10);
    await callProc('sp_increment_post_visits', [post.id, today]);

    const commentsResult = await callProc('sp_get_approved_comments', [post.id]);
    const comments = Array.isArray(commentsResult[0]) ? commentsResult[0] : commentsResult;

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
    const existing = await callProcOne('sp_check_slug_exists', [slug, null]);
    if (existing) slug = `${slug}-${Date.now()}`;

    const id_uuid = uuidv4();
    const publishedAt = status === 'published' ? new Date() : null;

    try {
      const createResult = await callProc('sp_create_post', [
        id_uuid, req.user.id, type, cleanTitle, slug, cleanExcerpt,
        cleanContent, coverImage, status, publishedAt
      ]);
      const insertRow = Array.isArray(createResult[0]) ? createResult[0][0] : createResult[0];
      const insertId = insertRow.insertId;

      await callProc('sp_insert_admin_log', [
        req.user.id, 'POST_CREATED', 'post', insertId, req.ip,
        JSON.stringify({ title: cleanTitle })
      ]);

      const newPost = await callProcOne('sp_get_post_by_id', [insertId]);
      return res.status(201).json({ post: newPost });
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
    const { id } = req.params;
    const existing = await callProcOne('sp_get_post_by_id', [id]);
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
      const slugCheck = await callProcOne('sp_check_slug_exists', [slug, parseInt(id)]);
      if (slugCheck) slug = `${slug}-${Date.now()}`;
    }

    try {
      await callProc('sp_update_post', [
        id, cleanTitle, slug, cleanExcerpt, cleanContent,
        coverImage, newType, newStatus, publishedAt
      ]);

      await callProc('sp_insert_admin_log', [
        req.user.id, 'POST_UPDATED', 'post', parseInt(id), req.ip, null
      ]);

      const updated = await callProcOne('sp_get_post_by_id', [id]);
      return res.json({ post: updated });
    } catch (err) {
      console.error('PUT /posts/:id error:', err);
      return res.status(500).json({ error: 'Errore nell\'aggiornamento dell\'articolo.' });
    }
  }
);

// DELETE /api/posts/:id — Elimina articolo (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const post = await callProcOne('sp_get_post_by_id', [id]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  try {
    await callProc('sp_delete_post', [id]);
    await callProc('sp_insert_admin_log', [
      req.user.id, 'POST_DELETED', 'post', parseInt(id), req.ip,
      JSON.stringify({ title: post.title })
    ]);
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
