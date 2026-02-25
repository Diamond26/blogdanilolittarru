const { sql } = require('@vercel/postgres');
const { createHandler } = require('../../_lib/handler');
const { getUser } = require('../../_lib/auth');
const { generateFingerprint } = require('../../_lib/security');

module.exports = createHandler({
  POST: async (req, res) => {
    const postId = parseInt(req.query.postId, 10);
    if (isNaN(postId)) return res.status(400).json({ error: 'Post non valido.' });

    const user = await getUser(req);
    const statusFilter = user ? '%' : 'published';

    const { rows: postRows } = await sql`SELECT id FROM posts WHERE id = ${postId} AND status LIKE ${statusFilter} LIMIT 1`;
    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });

    const fingerprint = generateFingerprint(req);

    const { rows: existing } = await sql`SELECT id FROM likes WHERE post_id = ${postId} AND fingerprint = ${fingerprint} LIMIT 1`;

    let liked;
    if (existing.length > 0) {
      await sql`DELETE FROM likes WHERE post_id = ${postId} AND fingerprint = ${fingerprint}`;
      liked = false;
    } else {
      await sql`INSERT INTO likes (post_id, fingerprint) VALUES (${postId}, ${fingerprint})`;
      liked = true;
    }

    const { rows: countRows } = await sql`SELECT COUNT(*) as total FROM likes WHERE post_id = ${postId}`;
    return res.json({ liked, count: parseInt(countRows[0].total, 10) });
  },
});
