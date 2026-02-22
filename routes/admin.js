// routes/admin.js - Dashboard statistiche admin (BACKEND)
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

// Tutte le route richiedono autenticazione admin
router.use(requireAdmin);

// GET /api/admin/stats - Statistiche generali
router.get('/stats', async (req, res) => {
  try {
    const [siteVisits] = await query('SELECT COALESCE(SUM(count),0) AS total FROM site_visits');
    const [postCount]  = await query("SELECT COUNT(*) AS total FROM posts WHERE status = 'published'");
    const [draftCount] = await query("SELECT COUNT(*) AS total FROM posts WHERE status = 'draft'");
    const [commentPending] = await query('SELECT COUNT(*) AS total FROM comments WHERE is_approved = 0');
    const [totalLikes] = await query('SELECT COUNT(*) AS total FROM likes');

    // Visite ultime 30 giorni
    const visits30 = await query(
      `SELECT visit_date, count FROM site_visits
       WHERE visit_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ORDER BY visit_date ASC`
    );

    // Top 5 post per visite
    const topPosts = await query(
      `SELECT p.id, p.title, p.slug, p.type,
              COALESCE(SUM(pv.count),0) AS visits,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comments
       FROM posts p
       LEFT JOIN post_visits pv ON pv.post_id = p.id
       GROUP BY p.id
       ORDER BY visits DESC
       LIMIT 5`
    );

    // Log recenti
    const recentLogs = await query(
      `SELECT al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at,
              al.details, u.email AS user_email
       FROM admin_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 20`
    );

    return res.json({
      site_visits_total:    siteVisits.total,
      posts_published:      postCount.total,
      posts_draft:          draftCount.total,
      comments_pending:     commentPending.total,
      total_likes:          totalLikes.total,
      visits_last_30_days:  visits30,
      top_posts:            topPosts,
      recent_logs:          recentLogs,
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    return res.status(500).json({ error: 'Errore nel caricamento delle statistiche.' });
  }
});

// GET /api/admin/posts - Lista completa post (draft + published)
router.get('/posts', async (req, res) => {
  try {
    const posts = await query(
      `SELECT p.id, p.type, p.title, p.slug, p.status, p.published_at, p.created_at,
              COALESCE(SUM(pv.count),0) AS visits,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comments,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 0) AS pending_comments
       FROM posts p
       LEFT JOIN post_visits pv ON pv.post_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    return res.json({ posts });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

// GET /api/admin/comments - Tutti i commenti con stato
router.get('/comments', async (req, res) => {
  try {
    const comments = await query(
      `SELECT c.*, p.title AS post_title, p.slug AS post_slug
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       ORDER BY c.is_approved ASC, c.created_at DESC
       LIMIT 200`
    );
    return res.json({ comments });
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel caricamento.' });
  }
});

module.exports = router;
