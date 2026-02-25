const { sql } = require('@vercel/postgres');
const { createHandler } = require('../_lib/handler');
const { getUser } = require('../_lib/auth');
const { sanitizeText } = require('../_lib/security');

module.exports = createHandler({
  POST: async (req, res) => {
    const user = await getUser(req);
    const { post_id, parent_id = null, author_name, author_email, content } = req.body || {};

    if (!post_id || isNaN(parseInt(post_id, 10))) {
      return res.status(400).json({ error: 'post_id non valido.' });
    }
    if (!author_name || typeof author_name !== 'string' || author_name.trim().length === 0 || author_name.length > 150) {
      return res.status(400).json({ error: 'Nome obbligatorio (max 150 caratteri).' });
    }
    if (!author_email || typeof author_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author_email)) {
      return res.status(400).json({ error: 'Email non valida.' });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
      return res.status(400).json({ error: 'Commento obbligatorio (max 2000 caratteri).' });
    }

    const postId = parseInt(post_id, 10);
    const statusFilter = user ? '%' : 'published';

    const { rows: postRows } = await sql`SELECT id FROM posts WHERE id = ${postId} AND status LIKE ${statusFilter} LIMIT 1`;
    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });

    if (parent_id) {
      const pid = parseInt(parent_id, 10);
      if (isNaN(pid)) return res.status(400).json({ error: 'parent_id non valido.' });
      const { rows: parentRows } = await sql`SELECT id FROM comments WHERE id = ${pid} AND post_id = ${postId} LIMIT 1`;
      if (parentRows.length === 0) return res.status(400).json({ error: 'Commento padre non trovato.' });
    }

    const cleanName = sanitizeText(author_name);
    const cleanEmail = sanitizeText(author_email);
    const cleanContent = sanitizeText(content);
    const parentIdVal = parent_id ? parseInt(parent_id, 10) : null;

    const { rows } = await sql`
      INSERT INTO comments (post_id, parent_id, author_name, author_email, content, is_approved)
      VALUES (${postId}, ${parentIdVal}, ${cleanName}, ${cleanEmail}, ${cleanContent}, false)
      RETURNING id
    `;

    return res.status(201).json({
      ok: true,
      message: 'Commento inviato. Sarà visibile dopo approvazione.',
      id: rows[0].id,
    });
  },
});
