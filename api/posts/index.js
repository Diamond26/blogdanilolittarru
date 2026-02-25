const { sql, getPool } = require('../_lib/db');
const { createHandler, getClientIp } = require('../_lib/handler');
const { requireAdmin, getUser } = require('../_lib/auth');
const { sanitizeHTML, sanitizeText, generateSlug } = require('../_lib/security');
const { parseFormData, uploadToBlob } = require('../_lib/upload');
const { v4: uuidv4 } = require('uuid');
const { fetchYouTubeVideoMetadata, extractYouTubeId } = require('./youtube/preview');

module.exports = createHandler({
  // GET /api/posts — Lista post pubblicati (con paginazione)
  GET: async (req, res) => {
    const user = await getUser(req);
    const isAdmin = !!user;
    const { type } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const offset = (page - 1) * limit;
    const statusFilter = isAdmin ? '%' : 'published';

    const pool = getPool();

    let countQuery = 'SELECT COUNT(*) as total FROM posts WHERE status LIKE $1';
    let countParams = [statusFilter];
    if (type && ['articolo', 'intervista'].includes(type)) {
      countQuery += ' AND type = $2';
      countParams.push(type);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total, 10);

    let listQuery = `
      SELECT p.*, u.email as author_email,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = true) as comment_count,
             (SELECT COALESCE(SUM(count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visit_count
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.status LIKE $1
    `;
    let listParams = [statusFilter];
    let paramIdx = 2;

    if (type && ['articolo', 'intervista'].includes(type)) {
      listQuery += ` AND p.type = $${paramIdx}`;
      listParams.push(type);
      paramIdx++;
    }

    listQuery += ` ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    listParams.push(limit, offset);

    const { rows: posts } = await pool.query(listQuery, listParams);

    return res.json({
      posts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  },

  // POST /api/posts — Crea articolo (admin, multipart)
  POST: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { fields, files } = await parseFormData(req);
    const { title, content, excerpt, youtube_url, type = 'articolo', status = 'draft' } = fields;
    const finalType = type || 'articolo';

    let cleanTitle = sanitizeText(title || '');
    let cleanContent = '';
    let cleanExcerpt = sanitizeText(excerpt || '');
    let coverImage = null;
    let finalStatus = status || 'draft';
    let publishedAt = finalStatus === 'published' ? new Date().toISOString() : null;

    if (finalType === 'intervista') {
      if (!youtube_url || !extractYouTubeId(String(youtube_url).trim())) {
        return res.status(400).json({ error: 'Link YouTube obbligatorio per le interviste.' });
      }
      const meta = await fetchYouTubeVideoMetadata(String(youtube_url).trim());
      cleanTitle = sanitizeText(meta.title || cleanTitle);
      cleanContent = meta.url;
      cleanExcerpt = sanitizeText(meta.description || cleanExcerpt);
      coverImage = meta.thumbnail ? sanitizeText(meta.thumbnail) : null;
      finalStatus = 'published';
      publishedAt = meta.publishedAt ? new Date(meta.publishedAt).toISOString() : new Date().toISOString();
      if (isNaN(new Date(publishedAt).getTime())) publishedAt = new Date().toISOString();
    } else {
      if (!cleanTitle) return res.status(400).json({ error: 'Titolo obbligatorio.' });
      if (!content) return res.status(400).json({ error: 'Contenuto obbligatorio.' });
      if (cleanTitle.length > 500) return res.status(400).json({ error: 'Titolo troppo lungo (max 500).' });
      cleanContent = sanitizeHTML(content);
      if (files.cover_image) {
        coverImage = await uploadToBlob(files.cover_image);
      }
    }

    let slug = generateSlug(cleanTitle);
    const { rows: slugRows } = await sql`SELECT id FROM posts WHERE slug = ${slug} LIMIT 1`;
    if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;

    const postUuid = uuidv4();
    const ip = getClientIp(req);

    const { rows } = await sql`
      INSERT INTO posts (uuid, author_id, type, title, slug, excerpt, content, cover_image, status, published_at)
      VALUES (${postUuid}, ${user.id}, ${finalType}, ${cleanTitle}, ${slug}, ${cleanExcerpt}, ${cleanContent}, ${coverImage}, ${finalStatus}, ${publishedAt})
      RETURNING *
    `;

    await sql`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
      VALUES (${user.id}, 'POST_CREATED', 'post', ${rows[0].id}, ${ip}, ${JSON.stringify({ title: cleanTitle })})
    `;

    return res.status(201).json({ post: rows[0] });
  },
});

module.exports.config = { api: { bodyParser: false } };
