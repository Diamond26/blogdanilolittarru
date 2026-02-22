// routes/likes.js - Sistema like basato su fingerprint IP+UA
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../utils/db');
const { generateFingerprint } = require('../middleware/security');

// POST /api/likes/:postId - Metti/togli like
router.post('/:postId', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ error: 'Post non valido.' });

  const post = await queryOne("SELECT id FROM posts WHERE id = ? AND status = 'published'", [postId]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  const fingerprint = generateFingerprint(req);

  try {
    const existing = await queryOne(
      'SELECT id FROM likes WHERE post_id = ? AND fingerprint = ?',
      [postId, fingerprint]
    );

    if (existing) {
      await query('DELETE FROM likes WHERE id = ?', [existing.id]);
    } else {
      await query('INSERT INTO likes (post_id, fingerprint) VALUES (?, ?)', [postId, fingerprint]);
    }

    const [countRow] = await query('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?', [postId]);
    return res.json({ liked: !existing, count: countRow.total });
  } catch (err) {
    console.error('POST /likes error:', err);
    return res.status(500).json({ error: 'Errore nel like.' });
  }
});

// GET /api/likes/:postId/status - Stato like corrente utente
router.get('/:postId/status', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ liked: false, count: 0 });

  const fingerprint = generateFingerprint(req);
  const existing = await queryOne(
    'SELECT id FROM likes WHERE post_id = ? AND fingerprint = ?',
    [postId, fingerprint]
  );
  const [countRow] = await query('SELECT COUNT(*) AS total FROM likes WHERE post_id = ?', [postId]);
  return res.json({ liked: !!existing, count: countRow.total });
});

module.exports = router;
