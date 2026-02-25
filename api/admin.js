const { sql } = require('./_lib/db');
const { createHandler } = require('./_lib/handler');
const { requireAdmin } = require('./_lib/auth');

module.exports = createHandler({
    GET: async (req, res) => {
        const user = await requireAdmin(req, res);
        if (!user) return;

        const url = req.url || '';
        const urlObj = new URL(url, 'http://localhost');
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (url.includes('/stats')) {
            const { rows: siteVisits } = await sql`SELECT COALESCE(SUM(count), 0) as site_visits_total FROM site_visits`;
            const { rows: postCount } = await sql`SELECT COUNT(*) as posts_published FROM posts WHERE status = 'published'`;
            const { rows: draftCount } = await sql`SELECT COUNT(*) as posts_draft FROM posts WHERE status = 'draft'`;
            const { rows: commentPend } = await sql`SELECT COUNT(*) as comments_pending FROM comments WHERE is_approved = false`;
            const { rows: totalLikes } = await sql`SELECT COUNT(*) as total_likes FROM likes`;
            const { rows: visits30 } = await sql`SELECT visit_date, count FROM site_visits ORDER BY visit_date DESC LIMIT 30`;
            const { rows: topPosts } = await sql`
        SELECT p.title,
               (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments
        FROM posts p
        WHERE p.status = 'published'
        ORDER BY visits DESC
        LIMIT 5
      `;
            const { rows: recentLogs } = await sql`
        SELECT al.*, u.email as user_email
        FROM admin_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 10
      `;
            return res.json({
                site_visits_total: parseInt(siteVisits[0].site_visits_total, 10),
                posts_published: parseInt(postCount[0].posts_published, 10),
                posts_draft: parseInt(draftCount[0].posts_draft, 10),
                comments_pending: parseInt(commentPend[0].comments_pending, 10),
                total_likes: parseInt(totalLikes[0].total_likes, 10),
                visits_last_30_days: visits30,
                top_posts: topPosts,
                recent_logs: recentLogs,
            });
        }

        if (url.includes('/logs')) {
            const { rows: logs } = await sql`
        SELECT al.*, u.email as user_email
        FROM admin_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
      `;
            return res.json({ logs });
        }

        if (url.includes('/posts')) {
            if (pathParts.length === 3) {
                const { rows: posts } = await sql`
          SELECT p.*,
                 (SELECT COALESCE(SUM(pv.count), 0) FROM post_visits pv WHERE pv.post_id = p.id) as visits,
                 (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes,
                 (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments,
                 (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = false) as pending_comments
          FROM posts p
          ORDER BY p.created_at DESC
        `;
                return res.json({ posts });
            } else if (pathParts.length === 4) {
                const id = parseInt(pathParts[3], 10);
                if (isNaN(id)) return res.status(400).json({ error: 'ID post non valido.' });
                const { rows: posts } = await sql`SELECT * FROM posts WHERE id = ${id} LIMIT 1`;
                if (!posts.length) return res.status(404).json({ error: 'Articolo non trovato.' });
                return res.json({ post: posts[0] });
            }
        }

        return res.status(404).json({ error: 'Endpoint non trovato.' });
    }
});
