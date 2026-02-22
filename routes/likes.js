const express = require('express');
const router = express.Router();
const { callProc, callProcOne } = require('../utils/db');
const { generateFingerprint } = require('../middleware/security');

// POST /api/likes/:postId — Metti/togli like
router.post('/:postId', async (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ error: 'Post non valido.' });

  const post = await callProcOne('sp_check_post_published', [postId]);
  if (!post) return res.status(404).json({ error: 'Articolo non trovato.' });

  const fingerprint = generateFingerprint(req);

  try {
    const result = await callProc('sp_toggle_like', [postId, fingerprint]);
    const row = Array.isArray(result[0]) ? result[0][0] : result[0];
    return res.json({ liked: !!row.liked, count: row.total });
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

  try {
    const row = await callProcOne('sp_get_like_status', [postId, fingerprint]);
    return res.json({ liked: !!row.liked, count: row.total });
  } catch (err) {
    console.error('GET /likes/:postId/status error:', err);
    return res.status(500).json({ liked: false, count: 0 });
  }
});

module.exports = router;
