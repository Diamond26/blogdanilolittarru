const express = require('express');
const router = express.Router();
const { getPool } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/stats — Statistiche generali
router.get('/stats', async (req, res) => {
  try {
    const db = require('../utils/db').getPool();

    const [siteVisits] = await db.execute('SELECT COALESCE(SUM(count), 0) as site_visits_total FROM site_visits');
    const [postCount] = await db.execute('SELECT COUNT(*) as posts_published FROM posts WHERE status = "published"');
    const [draftCount] = await db.execute('SELECT COUNT(*) as posts_draft FROM posts WHERE status = "draft"');
    const [commentPend] = await db.execute('SELECT COUNT(*) as comments_pending FROM comments WHERE is_approved = 0');
    const [totalLikes] = await db.execute('SELECT COUNT(*) as total_likes FROM likes');
    const [visits30] = await db.execute('SELECT visit_date, count FROM site_visits ORDER BY visit_date DESC LIMIT 30');
    const [topPosts] = await db.execute(`
      SELECT p.title, 
             (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments
      FROM posts p 
      WHERE p.status = "published"
      ORDER BY visits DESC 
      LIMIT 5
    `);
    const [recentLogs] = await db.execute(`
      SELECT al.*, u.email as user_email 
      FROM admin_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      ORDER BY al.created_at DESC 
      LIMIT 10
    `);

    return res.json({
      site_visits_total: siteVisits[0].site_visits_total,
      posts_published: postCount[0].posts_published,
      posts_draft: draftCount[0].posts_draft,
      comments_pending: commentPend[0].comments_pending,
      total_likes: totalLikes[0].total_likes,
      visits_last_30_days: visits30,
      top_posts: topPosts,
      recent_logs: recentLogs
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento delle statistiche.' });
  }
});

// GET /api/admin/posts — Lista completa post (draft + published)
router.get('/posts', async (req, res) => {
  try {
    const db = require('../utils/db').getPool();
    const [posts] = await db.execute(`
      SELECT p.*, 
             (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 0) as pending_comments
      FROM posts p 
      ORDER BY p.created_at DESC
    `);
    return res.json({ posts });
  } catch (err) {
    console.error('GET /admin/posts error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// GET /api/admin/posts/:id — Dettaglio post per modifica (senza incrementare visite)
router.get('/posts/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID post non valido.' });

  try {
    const db = require('../utils/db').getPool();
    const [posts] = await db.execute('SELECT * FROM posts WHERE id = ? LIMIT 1', [id]);
    if (!posts.length) return res.status(404).json({ error: 'Articolo non trovato.' });
    return res.json({ post: posts[0] });
  } catch (err) {
    console.error('GET /admin/posts/:id error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento del post.' });
  }
});

// GET /api/admin/comments — Tutti i commenti con stato
router.get('/comments', async (req, res) => {
  try {
    const db = require('../utils/db').getPool();
    const [comments] = await db.execute(`
      SELECT c.*, p.title as post_title 
      FROM comments c 
      JOIN posts p ON c.post_id = p.id 
      ORDER BY c.created_at DESC
    `);
    return res.json({ comments });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// GET /api/admin/logs — Log attività admin
router.get('/logs', async (req, res) => {
  try {
    const db = require('../utils/db').getPool();
    const [logs] = await db.execute(`
      SELECT al.*, u.email as user_email 
      FROM admin_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      ORDER BY al.created_at DESC
    `);
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento dei log.' });
  }
});

module.exports = router;
