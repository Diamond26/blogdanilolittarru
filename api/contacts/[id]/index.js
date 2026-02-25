const { sql } = require('@vercel/postgres');
const { createHandler } = require('../../_lib/handler');
const { requireAdmin } = require('../../_lib/auth');

module.exports = createHandler({
  DELETE: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const id = parseInt(req.query.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });

    await sql`DELETE FROM contacts WHERE id = ${id}`;
    return res.json({ success: true });
  },
});
