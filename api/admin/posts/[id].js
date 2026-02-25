const { sql } = require('@vercel/postgres');
const { createHandler } = require('../../_lib/handler');
const { requireAdmin } = require('../../_lib/auth');

module.exports = createHandler({
  GET: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const id = parseInt(req.query.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID post non valido.' });

    const { rows: posts } = await sql`SELECT * FROM posts WHERE id = ${id} LIMIT 1`;
    if (!posts.length) return res.status(404).json({ error: 'Articolo non trovato.' });

    return res.json({ post: posts[0] });
  },
});
