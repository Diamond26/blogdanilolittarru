const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { callProc, callProcOne } = require('../utils/db');
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

  const post = await callProcOne('sp_check_post_published', [post_id]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  if (parent_id) {
    const parent = await callProcOne('sp_check_comment_parent', [parent_id, post_id]);
    if (!parent) return res.status(400).json({ error: 'Commento padre non trovato.' });
  }

  try {
    const result = await callProc('sp_insert_comment', [
      post_id, parent_id, sanitizeText(author_name),
      sanitizeText(author_email), sanitizeText(content)
    ]);
    const insertRow = Array.isArray(result[0]) ? result[0][0] : result[0];
    return res.status(201).json({
      ok: true,
      message: 'Commento inviato. Sarà visibile dopo approvazione.',
      id: insertRow.insertId,
    });
  } catch (err) {
    console.error('POST /comments error:', err);
    return res.status(500).json({ error: 'Errore nell\'invio del commento.' });
  }
});

// GET /api/comments/pending — Lista commenti da approvare (admin)
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const result = await callProc('sp_get_pending_comments', []);
    const comments = Array.isArray(result[0]) ? result[0] : result;
    return res.json({ comments });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// PATCH /api/comments/:id/approve — Approva commento (admin)
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  await callProc('sp_approve_comment', [id]);
  await callProc('sp_insert_admin_log', [
    req.user.id, 'COMMENT_APPROVED', 'comment', parseInt(id), req.ip, null
  ]);
  return res.json({ ok: true });
});

// DELETE /api/comments/:id — Elimina commento (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  await callProc('sp_delete_comment', [id]);
  await callProc('sp_insert_admin_log', [
    req.user.id, 'COMMENT_DELETED', 'comment', parseInt(id), req.ip, null
  ]);
  return res.json({ ok: true });
});

module.exports = router;
