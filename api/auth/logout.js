const { sql } = require('@vercel/postgres');
const { createHandler, getClientIp } = require('../_lib/handler');
const { requireAdmin, clearAuthCookie } = require('../_lib/auth');

module.exports = createHandler({
  POST: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const ip = getClientIp(req);
    await sql`
      INSERT INTO admin_logs (user_id, action, entity_type, ip_address)
      VALUES (${user.id}, 'LOGOUT', 'auth', ${ip})
    `;

    clearAuthCookie(res);
    return res.json({ ok: true, message: 'Disconnesso.' });
  },
});
