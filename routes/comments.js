const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getPool } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');
const { sanitizeText } = require('../middleware/security');

// POST /api/comments — Aggiungi commento
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
  const db = require('../utils/db').getPool();

  try {
    const [postRows] = await db.execute('SELECT id FROM posts WHERE id = ? AND status = "published" LIMIT 1', [post_id]);
    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });

    if (parent_id) {
      const [parentRows] = await db.execute('SELECT id FROM comments WHERE id = ? AND post_id = ? LIMIT 1', [parent_id, post_id]);
      if (parentRows.length === 0) return res.status(400).json({ error: 'Commento padre non trovato.' });
    }

    const [result] = await db.execute(`
      INSERT INTO comments (post_id, parent_id, author_name, author_email, content, is_approved)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [post_id, parent_id, sanitizeText(author_name), sanitizeText(author_email), sanitizeText(content)]);

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

// GET /api/comments/pending — Lista commenti da approvare (admin)
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const db = require('../utils/db').getPool();
    const [comments] = await db.execute(`
      SELECT c.*, p.title as post_title
      FROM comments c
      JOIN posts p ON c.post_id = p.id
      WHERE c.is_approved = 0
      ORDER BY c.created_at DESC
    `);
    return res.json({ comments });
  } catch (err) {
    console.error('GET /comments/pending error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// PATCH /api/comments/:id/approve — Approva commento (admin)
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = require('../utils/db').getPool();

  try {
    await db.execute('UPDATE comments SET is_approved = 1 WHERE id = ?', [id]);

    await db.execute(`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'COMMENT_APPROVED', 'comment', parseInt(id), req.ip, null]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /comments/:id/approve error:', err);
    return res.status(500).json({ error: 'Errore nell\'approvazione del commento.' });
  }
});

// DELETE /api/comments/:id — Elimina commento (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = require('../utils/db').getPool();

  try {
    await db.execute('DELETE FROM comments WHERE id = ?', [id]);

    await db.execute(`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'COMMENT_DELETED', 'comment', parseInt(id), req.ip, null]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /comments/:id error:', err);
    return res.status(500).json({ error: 'Errore nell\'eliminazione del commento.' });
  }
});

module.exports = router;
