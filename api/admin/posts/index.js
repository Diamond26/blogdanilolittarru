const { sql } = require('@vercel/postgres');
const { createHandler } = require('../../_lib/handler');
const { requireAdmin } = require('../../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { rows: posts } = await sql`
      SELECT p.*,
             (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = false) as pending_comments
      FROM posts p
      ORDER BY p.created_at DESC
    `;

    return res.json({ posts });
  },
});
