const { sql } = require('@vercel/postgres');
const { createHandler } = require('../_lib/handler');
const { requireAdmin } = require('../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { rows: logs } = await sql`
      SELECT al.*, u.email as user_email
      FROM admin_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
    `;

    return res.json({ logs });
  },
});
