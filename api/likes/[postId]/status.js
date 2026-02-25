const { sql } = require('@vercel/postgres');
const { createHandler } = require('../../_lib/handler');
const { generateFingerprint } = require('../../_lib/security');

module.exports = createHandler({
  GET: async (req, res) => {
    const postId = parseInt(req.query.postId, 10);
    if (isNaN(postId)) return res.json({ liked: false, count: 0 });

    const fingerprint = generateFingerprint(req);

    const { rows: likeRows } = await sql`SELECT id FROM likes WHERE post_id = ${postId} AND fingerprint = ${fingerprint} LIMIT 1`;
    const { rows: countRows } = await sql`SELECT COUNT(*) as total FROM likes WHERE post_id = ${postId}`;

    return res.json({
      liked: likeRows.length > 0,
      count: parseInt(countRows[0].total, 10),
    });
  },
});
