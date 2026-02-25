const { sql, getPool } = require('./_lib/db');
const { createHandler, getClientIp } = require('./_lib/handler');
const { requireAdmin, getUser } = require('./_lib/auth');
const { sanitizeHTML, sanitizeText, generateSlug } = require('./_lib/security');
const { parseFormData, uploadToBlob } = require('./_lib/upload');
const { v4: uuidv4 } = require('uuid');
const { fetchYouTubeVideoMetadata, extractYouTubeId } = require('./_lib/youtube');

module.exports = createHandler({
    GET: async (req, res) => {
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (url.includes('/youtube/preview')) {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const ytUrl = req.query.url;
            if (!ytUrl || typeof ytUrl !== 'string' || !ytUrl.trim()) {
                return res.status(400).json({ error: 'Link YouTube non valido.' });
            }
            const meta = await fetchYouTubeVideoMetadata(ytUrl.trim());
            return res.json({
                preview: {
                    url: meta.url,
                    title: meta.title || '',
                    description: meta.description || '',
                    thumbnail: meta.thumbnail || '',
                    published_at: meta.publishedAt || null,
                },
            });
        }

        if (pathParts.length === 2 && pathParts[1] === 'posts') {
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
        }

        if (pathParts.length === 3 && pathParts[1] === 'posts') {
            const param = pathParts[2];
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
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    },
    POST: async (req, res) => {
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (pathParts.length === 4 && pathParts[3] === 'image') {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const { files } = await parseFormData(req);
            if (!files.image) return res.status(400).json({ error: 'Nessun file caricato.' });
            const imageUrl = await uploadToBlob(files.image);
            return res.json({ url: imageUrl });
        }

        if (pathParts.length === 2 && pathParts[1] === 'posts') {
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
                if (files.cover_image) coverImage = await uploadToBlob(files.cover_image);
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
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    },
    PUT: async (req, res) => {
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length === 3 && pathParts[1] === 'posts') {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const id = parseInt(pathParts[2], 10);
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
                if (!extractYouTubeId(sourceUrl)) return res.status(400).json({ error: 'Link YouTube obbligatorio e valido per le interviste.' });
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
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    },
    DELETE: async (req, res) => {
        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        if (pathParts.length === 3 && pathParts[1] === 'posts') {
            const user = await requireAdmin(req, res);
            if (!user) return;
            const id = parseInt(pathParts[2], 10);
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
        }
        return res.status(404).json({ error: 'Endpoint non trovato.' });
    }
});

module.exports.config = { api: { bodyParser: false } };
