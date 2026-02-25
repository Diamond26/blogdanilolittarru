const { sql } = require('@vercel/postgres');
const { createHandler } = require('../_lib/handler');
const { requireAdmin } = require('../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { rows: siteVisits } = await sql`SELECT COALESCE(SUM(count), 0) as site_visits_total FROM site_visits`;
    const { rows: postCount } = await sql`SELECT COUNT(*) as posts_published FROM posts WHERE status = 'published'`;
    const { rows: draftCount } = await sql`SELECT COUNT(*) as posts_draft FROM posts WHERE status = 'draft'`;
    const { rows: commentPend } = await sql`SELECT COUNT(*) as comments_pending FROM comments WHERE is_approved = false`;
    const { rows: totalLikes } = await sql`SELECT COUNT(*) as total_likes FROM likes`;
    const { rows: visits30 } = await sql`SELECT visit_date, count FROM site_visits ORDER BY visit_date DESC LIMIT 30`;
    const { rows: topPosts } = await sql`
      SELECT p.title,
             (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments
      FROM posts p
      WHERE p.status = 'published'
      ORDER BY visits DESC
      LIMIT 5
    `;
    const { rows: recentLogs } = await sql`
      SELECT al.*, u.email as user_email
      FROM admin_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `;

    return res.json({
      site_visits_total: parseInt(siteVisits[0].site_visits_total, 10),
      posts_published: parseInt(postCount[0].posts_published, 10),
      posts_draft: parseInt(draftCount[0].posts_draft, 10),
      comments_pending: parseInt(commentPend[0].comments_pending, 10),
      total_likes: parseInt(totalLikes[0].total_likes, 10),
      visits_last_30_days: visits30,
      top_posts: topPosts,
      recent_logs: recentLogs,
    });
  },
});
