const { sql } = require('@vercel/postgres');
const { createHandler, getClientIp } = require('../../_lib/handler');
const { requireAdmin } = require('../../_lib/auth');

module.exports = createHandler({
  DELETE: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const id = parseInt(req.query.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });

    const ip = getClientIp(req);

    await sql`DELETE FROM comments WHERE id = ${id}`;

    await sql`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address)
      VALUES (${user.id}, 'COMMENT_DELETED', 'comment', ${id}, ${ip})
    `;

    return res.json({ ok: true });
  },
});
