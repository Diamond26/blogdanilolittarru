const express = require('express');
const router = express.Router();
const { getPool } = require('../utils/db');
const { generateFingerprint } = require('../middleware/security');

// POST /api/likes/:postId — Metti/togli like
router.post('/:postId', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ error: 'Post non valido.' });

  const db = require('../utils/db').getPool();

  try {
    const [postRows] = await db.execute('SELECT id FROM posts WHERE id = ? AND status = "published" LIMIT 1', [postId]);
    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });

    const fingerprint = generateFingerprint(req);

    // Check if liked
    const [existing] = await db.execute('SELECT id FROM likes WHERE post_id = ? AND fingerprint = ? LIMIT 1', [postId, fingerprint]);

    let liked = false;
    if (existing.length > 0) {
      await db.execute('DELETE FROM likes WHERE post_id = ? AND fingerprint = ?', [postId, fingerprint]);
      liked = false;
    } else {
      await db.execute('INSERT INTO likes (post_id, fingerprint) VALUES (?, ?)', [postId, fingerprint]);
      liked = true;
    }

    const [countRows] = await db.execute('SELECT COUNT(*) as total FROM likes WHERE post_id = ?', [postId]);
    return res.json({ liked, count: countRows[0].total });
  } catch (err) {
    console.error('POST /likes error:', err);
    return res.status(500).json({ error: 'Errore nel like.' });
  }
});

// GET /api/likes/:postId/status — Stato like corrente utente
router.get('/:postId/status', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ liked: false, count: 0 });

  const fingerprint = generateFingerprint(req);
  const db = require('../utils/db').getPool();

  try {
    const [likeRows] = await db.execute('SELECT id FROM likes WHERE post_id = ? AND fingerprint = ? LIMIT 1', [postId, fingerprint]);
    const [countRows] = await db.execute('SELECT COUNT(*) as total FROM likes WHERE post_id = ?', [postId]);

    return res.json({ liked: likeRows.length > 0, count: countRows[0].total });
  } catch (err) {
    console.error('GET /likes/:postId/status error:', err);
    return res.status(500).json({ liked: false, count: 0 });
  }
});

module.exports = router;
