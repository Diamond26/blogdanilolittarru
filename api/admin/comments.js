const { sql } = require('@vercel/postgres');
const { createHandler } = require('../_lib/handler');
const { requireAdmin } = require('../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { rows: comments } = await sql`
      SELECT c.*, p.title as post_title
      FROM comments c
      JOIN posts p ON c.post_id = p.id
      ORDER BY c.created_at DESC
    `;

    return res.json({ comments });
  },
});
