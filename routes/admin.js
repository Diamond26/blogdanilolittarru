const express = require('express');
const router = express.Router();
const { callProc } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/stats — Statistiche generali
router.get('/stats', async (req, res) => {
  try {
    const results = await callProc('sp_get_dashboard_stats', []);

    const siteVisits = results[0][0];
    const postCount = results[1][0];
    const draftCount = results[2][0];
    const commentPend = results[3][0];
    const totalLikes = results[4][0];
    const visits30 = results[5];
    const topPosts = results[6];

    return res.json({
      site_visits_total: siteVisits.site_visits_total,
      posts_published: postCount.posts_published,
      posts_draft: draftCount.posts_draft,
      comments_pending: commentPend.comments_pending,
      total_likes: totalLikes.total_likes,
      visits_last_30_days: visits30,
      top_posts: topPosts,
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento delle statistiche.' });
  }
});

// GET /api/admin/posts — Lista completa post (draft + published)
router.get('/posts', async (req, res) => {
  try {
    const result = await callProc('sp_get_admin_posts', []);
    const posts = Array.isArray(result[0]) ? result[0] : result;
    return res.json({ posts });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// GET /api/admin/comments — Tutti i commenti con stato
router.get('/comments', async (req, res) => {
  try {
    const result = await callProc('sp_get_all_comments', []);
    const comments = Array.isArray(result[0]) ? result[0] : result;
    return res.json({ comments });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// GET /api/admin/logs — Log attività admin
router.get('/logs', async (req, res) => {
  try {
    const result = await callProc('sp_get_admin_logs', []);
    const logs = Array.isArray(result[0]) ? result[0] : result;
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento dei log.' });
  }
});

module.exports = router;
