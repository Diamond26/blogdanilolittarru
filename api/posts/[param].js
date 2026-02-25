const { sql } = require('@vercel/postgres');
const { createHandler, getClientIp } = require('../_lib/handler');
const { requireAdmin, getUser } = require('../_lib/auth');
const { sanitizeHTML, sanitizeText, generateSlug } = require('../_lib/security');
const { parseFormData, uploadToBlob } = require('../_lib/upload');
const { fetchYouTubeVideoMetadata, extractYouTubeId } = require('./youtube/preview');

module.exports = createHandler({
  // GET /api/posts/:slug — Singolo post per slug
  GET: async (req, res) => {
    const { param } = req.query;
    if (!param) return res.status(400).json({ error: 'Parametro mancante.' });

    const user = await getUser(req);
    const isAdmin = !!user;
    const statusFilter = isAdmin ? '%' : 'published';

    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const { rows: postRows } = await sql`
      SELECT p.*, u.email as author_email,
             (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
             (SELECT COALESCE(SUM(count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visit_count
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.slug = ${param} AND p.status LIKE ${statusFilter}
      LIMIT 1
    `;

    if (postRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
    const post = postRows[0];

    const today = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO post_visits (post_id, visit_date, count)
      VALUES (${post.id}, ${today}, 1)
      ON CONFLICT (post_id, visit_date) DO UPDATE SET count = post_visits.count + 1
    `;
    post.visit_count = Number(post.visit_count || 0) + 1;

    const { rows: comments } = await sql`
      SELECT id, parent_id, author_name, content, created_at
      FROM comments
      WHERE post_id = ${post.id} AND is_approved = true
      ORDER BY created_at ASC
    `;

    return res.json({ post, comments });
  },

  // PUT /api/posts/:id — Modifica articolo (admin, multipart)
  PUT: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { param } = req.query;
    const id = parseInt(param, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });

    const { rows: existingRows } = await sql`SELECT * FROM posts WHERE id = ${id}`;
    if (existingRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
    const existing = existingRows[0];

    const { fields, files } = await parseFormData(req);
    const { title, content, excerpt, type, status, remove_cover_image, youtube_url } = fields;
    const targetType = type || existing.type;

    let cleanTitle = title ? sanitizeText(title) : existing.title;
    let cleanContent = content ? sanitizeHTML(content) : existing.content;
    let cleanExcerpt = excerpt !== undefined ? sanitizeText(excerpt) : existing.excerpt;
    const shouldRemoveCover = remove_cover_image === '1' || remove_cover_image === 'true';
    let coverImage = existing.cover_image;
    if (shouldRemoveCover) coverImage = null;
    if (files.cover_image) coverImage = await uploadToBlob(files.cover_image);
    let newStatus = status || existing.status;
    let publishedAt = existing.published_at;
    if (newStatus === 'published' && !publishedAt) publishedAt = new Date().toISOString();

    if (targetType === 'intervista') {
      const sourceUrl = String(youtube_url || existing.content || '').trim();
      if (!extractYouTubeId(sourceUrl)) {
        return res.status(400).json({ error: 'Link YouTube obbligatorio e valido per le interviste.' });
      }
      const meta = await fetchYouTubeVideoMetadata(sourceUrl);
      cleanTitle = sanitizeText(meta.title || cleanTitle);
      cleanContent = meta.url;
      cleanExcerpt = sanitizeText(meta.description || cleanExcerpt || '');
      coverImage = meta.thumbnail ? sanitizeText(meta.thumbnail) : coverImage;
      newStatus = 'published';
      publishedAt = meta.publishedAt ? new Date(meta.publishedAt).toISOString() : (publishedAt || new Date().toISOString());
      if (isNaN(new Date(publishedAt).getTime())) publishedAt = new Date().toISOString();
    }

    let slug = existing.slug;
    if (cleanTitle && cleanTitle !== existing.title) {
      slug = generateSlug(cleanTitle);
      const { rows: slugRows } = await sql`SELECT id FROM posts WHERE slug = ${slug} AND id != ${id} LIMIT 1`;
      if (slugRows.length > 0) slug = `${slug}-${Date.now()}`;
    }

    const ip = getClientIp(req);

    await sql`
      UPDATE posts
      SET title = ${cleanTitle}, slug = ${slug}, excerpt = ${cleanExcerpt},
          content = ${cleanContent}, cover_image = ${coverImage}, type = ${targetType},
          status = ${newStatus}, published_at = ${publishedAt}, updated_at = NOW()
      WHERE id = ${id}
    `;

    await sql`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address)
      VALUES (${user.id}, 'POST_UPDATED', 'post', ${id}, ${ip})
    `;

    const { rows: updatedRows } = await sql`SELECT * FROM posts WHERE id = ${id}`;
    return res.json({ post: updatedRows[0] });
  },

  // DELETE /api/posts/:id — Elimina articolo (admin)
  DELETE: async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { param } = req.query;
    const id = parseInt(param, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });

    const { rows: existingRows } = await sql`SELECT * FROM posts WHERE id = ${id}`;
    if (existingRows.length === 0) return res.status(404).json({ error: 'Articolo non trovato.' });
    const post = existingRows[0];

    const ip = getClientIp(req);

    await sql`DELETE FROM post_visits WHERE post_id = ${id}`;
    await sql`DELETE FROM likes WHERE post_id = ${id}`;
    await sql`DELETE FROM comments WHERE post_id = ${id}`;
    await sql`DELETE FROM posts WHERE id = ${id}`;

    await sql`
      INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
      VALUES (${user.id}, 'POST_DELETED', 'post', ${id}, ${ip}, ${JSON.stringify({ title: post.title })})
    `;

    return res.json({ ok: true, message: 'Articolo eliminato.' });
  },
});

module.exports.config = { api: { bodyParser: false } };
