// routes/comments.js - Commenti e risposte threaded
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { query, queryOne } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');
const { sanitizeText } = require('../middleware/security');

// POST /api/comments - Aggiungi commento
router.post('/', [
  body('post_id').isInt({ min: 1 }).withMessage('post_id non valido.'),
  body('parent_id').optional().isInt({ min: 1 }),
  body('author_name').trim().notEmpty().isLength({ max: 150 }).withMessage('Nome obbligatorio.'),
  body('author_email').isEmail().normalizeEmail().withMessage('Email non valida.'),
  body('content').trim().notEmpty().isLength({ max: 2000 }).withMessage('Commento obbligatorio (max 2000 caratteri).'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { post_id, parent_id = null, author_name, author_email, content } = req.body;

  // Verifica che il post esista
  const post = await queryOne("SELECT id FROM posts WHERE id = ? AND status = 'published'", [post_id]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  // Verifica parent se presente
  if (parent_id) {
    const parent = await queryOne('SELECT id FROM comments WHERE id = ? AND post_id = ?', [parent_id, post_id]);
    if (!parent) return res.status(400).json({ error: 'Commento padre non trovato.' });
  }

  try {
    const result = await query(
      `INSERT INTO comments (post_id, parent_id, author_name, author_email, content, is_approved)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [post_id, parent_id, sanitizeText(author_name), sanitizeText(author_email), sanitizeText(content)]
    );
    return res.status(201).json({
      ok: true,
      message: 'Commento inviato. Sarà visibile dopo approvazione.',
      id: result.insertId,
    });
  } catch (err) {
    console.error('POST /comments error:', err);
    return res.status(500).json({ error: 'Errore nell\'invio del commento.' });
  }
});

// GET /api/comments/pending - Lista commenti da approvare (admin)
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const comments = await query(
      `SELECT c.*, p.title AS post_title, p.slug AS post_slug
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.is_approved = 0
       ORDER BY c.created_at DESC
       LIMIT 100`
    );
    return res.json({ comments });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// PATCH /api/comments/:id/approve - Approva commento (admin)
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  await query('UPDATE comments SET is_approved = 1 WHERE id = ?', [id]);
  await query(
    'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, 'COMMENT_APPROVED', 'comment', id, req.ip]
  );
  return res.json({ ok: true });
});

// DELETE /api/comments/:id - Elimina commento (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM comments WHERE id = ?', [id]);
  await query(
    'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, 'COMMENT_DELETED', 'comment', id, req.ip]
  );
  return res.json({ ok: true });
});

module.exports = router;
