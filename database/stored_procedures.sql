-- ============================================
-- Stored Procedures — Danilo Littarru Blog
-- Eseguire DOPO schema.sql
-- ============================================

USE littarru_db;

DELIMITER //

-- ════════════════════════════════
-- VISITE SITO
-- ════════════════════════════════

CREATE PROCEDURE sp_increment_site_visits(
  IN p_date DATE
)
BEGIN
  INSERT INTO site_visits (visit_date, count)
  VALUES (p_date, 1)
  ON DUPLICATE KEY UPDATE count = count + 1;
END //

-- ════════════════════════════════
-- VISITE POST
-- ════════════════════════════════

CREATE PROCEDURE sp_increment_post_visits(
  IN p_post_id INT UNSIGNED,
  IN p_date DATE
)
BEGIN
  INSERT INTO post_visits (post_id, visit_date, count)
  VALUES (p_post_id, p_date, 1)
  ON DUPLICATE KEY UPDATE count = count + 1;
END //

-- ════════════════════════════════
-- POST — CONTEGGIO
-- ════════════════════════════════

CREATE PROCEDURE sp_get_posts_count(
  IN p_type VARCHAR(20),
  IN p_published_only TINYINT
)
BEGIN
  SELECT COUNT(*) AS total
  FROM posts
  WHERE (p_type IS NULL OR type = p_type)
    AND (p_published_only = 0 OR status = 'published');
END //

-- ════════════════════════════════
-- POST — LISTA
-- ════════════════════════════════

CREATE PROCEDURE sp_get_posts_list(
  IN p_type VARCHAR(20),
  IN p_published_only TINYINT,
  IN p_limit INT,
  IN p_offset INT
)
BEGIN
  SELECT p.id, p.uuid, p.type, p.title, p.slug, p.excerpt,
         p.cover_image, p.status, p.published_at, p.created_at,
         u.email AS author_email,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COALESCE(SUM(pv.count),0) FROM post_visits pv WHERE pv.post_id = p.id) AS visit_count,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comment_count
  FROM posts p
  JOIN users u ON p.author_id = u.id
  WHERE (p_type IS NULL OR p.type = p_type)
    AND (p_published_only = 0 OR p.status = 'published')
  ORDER BY p.published_at DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END //

-- ════════════════════════════════
-- POST — SINGOLO PER SLUG
-- ════════════════════════════════

CREATE PROCEDURE sp_get_post_by_slug(
  IN p_slug VARCHAR(550),
  IN p_published_only TINYINT
)
BEGIN
  SELECT p.*, u.email AS author_email,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COALESCE(SUM(pv.count),0) FROM post_visits pv WHERE pv.post_id = p.id) AS visit_count
  FROM posts p
  JOIN users u ON p.author_id = u.id
  WHERE p.slug = p_slug
    AND (p_published_only = 0 OR p.status = 'published')
  LIMIT 1;
END //

-- ════════════════════════════════
-- POST — SINGOLO PER ID
-- ════════════════════════════════

CREATE PROCEDURE sp_get_post_by_id(
  IN p_id INT UNSIGNED
)
BEGIN
  SELECT * FROM posts WHERE id = p_id LIMIT 1;
END //

-- ════════════════════════════════
-- POST — VERIFICA SLUG
-- ════════════════════════════════

CREATE PROCEDURE sp_check_slug_exists(
  IN p_slug VARCHAR(550),
  IN p_exclude_id INT UNSIGNED
)
BEGIN
  SELECT id FROM posts
  WHERE slug = p_slug
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;
END //

-- ════════════════════════════════
-- POST — CREAZIONE
-- ════════════════════════════════

CREATE PROCEDURE sp_create_post(
  IN p_uuid CHAR(36),
  IN p_author_id INT UNSIGNED,
  IN p_type VARCHAR(20),
  IN p_title VARCHAR(500),
  IN p_slug VARCHAR(550),
  IN p_excerpt TEXT,
  IN p_content LONGTEXT,
  IN p_cover_image VARCHAR(500),
  IN p_status VARCHAR(20),
  IN p_published_at DATETIME
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  INSERT INTO posts (uuid, author_id, type, title, slug, excerpt, content, cover_image, status, published_at)
  VALUES (p_uuid, p_author_id, p_type, p_title, p_slug, p_excerpt, p_content, p_cover_image, p_status, p_published_at);

  SELECT LAST_INSERT_ID() AS insertId;

  COMMIT;
END //

-- ════════════════════════════════
-- POST — AGGIORNAMENTO
-- ════════════════════════════════

CREATE PROCEDURE sp_update_post(
  IN p_id INT UNSIGNED,
  IN p_title VARCHAR(500),
  IN p_slug VARCHAR(550),
  IN p_excerpt TEXT,
  IN p_content LONGTEXT,
  IN p_cover_image VARCHAR(500),
  IN p_type VARCHAR(20),
  IN p_status VARCHAR(20),
  IN p_published_at DATETIME
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  UPDATE posts
  SET title = p_title,
      slug = p_slug,
      excerpt = p_excerpt,
      content = p_content,
      cover_image = p_cover_image,
      type = p_type,
      status = p_status,
      published_at = p_published_at,
      updated_at = NOW()
  WHERE id = p_id;

  COMMIT;
END //

-- ════════════════════════════════
-- POST — ELIMINAZIONE
-- ════════════════════════════════

CREATE PROCEDURE sp_delete_post(
  IN p_id INT UNSIGNED
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  DELETE FROM posts WHERE id = p_id;
  COMMIT;
END //

-- ════════════════════════════════
-- COMMENTI — INSERIMENTO
-- ════════════════════════════════

CREATE PROCEDURE sp_insert_comment(
  IN p_post_id INT UNSIGNED,
  IN p_parent_id INT UNSIGNED,
  IN p_author_name VARCHAR(150),
  IN p_author_email VARCHAR(255),
  IN p_content TEXT
)
BEGIN
  INSERT INTO comments (post_id, parent_id, author_name, author_email, content, is_approved)
  VALUES (p_post_id, p_parent_id, p_author_name, p_author_email, p_content, 0);

  SELECT LAST_INSERT_ID() AS insertId;
END //

-- ════════════════════════════════
-- COMMENTI — APPROVATI PER POST
-- ════════════════════════════════

CREATE PROCEDURE sp_get_approved_comments(
  IN p_post_id INT UNSIGNED
)
BEGIN
  SELECT id, parent_id, author_name, content, created_at
  FROM comments
  WHERE post_id = p_post_id AND is_approved = 1
  ORDER BY created_at ASC;
END //

-- ════════════════════════════════
-- COMMENTI — VERIFICA POST ESISTE
-- ════════════════════════════════

CREATE PROCEDURE sp_check_post_published(
  IN p_post_id INT UNSIGNED
)
BEGIN
  SELECT id FROM posts
  WHERE id = p_post_id AND status = 'published'
  LIMIT 1;
END //

-- ════════════════════════════════
-- COMMENTI — VERIFICA PARENT
-- ════════════════════════════════

CREATE PROCEDURE sp_check_comment_parent(
  IN p_parent_id INT UNSIGNED,
  IN p_post_id INT UNSIGNED
)
BEGIN
  SELECT id FROM comments
  WHERE id = p_parent_id AND post_id = p_post_id
  LIMIT 1;
END //

-- ════════════════════════════════
-- COMMENTI — IN ATTESA
-- ════════════════════════════════

CREATE PROCEDURE sp_get_pending_comments()
BEGIN
  SELECT c.*, p.title AS post_title, p.slug AS post_slug
  FROM comments c
  JOIN posts p ON c.post_id = p.id
  WHERE c.is_approved = 0
  ORDER BY c.created_at DESC
  LIMIT 100;
END //

-- ════════════════════════════════
-- COMMENTI — APPROVA
-- ════════════════════════════════

CREATE PROCEDURE sp_approve_comment(
  IN p_id INT UNSIGNED
)
BEGIN
  UPDATE comments SET is_approved = 1 WHERE id = p_id;
END //

-- ════════════════════════════════
-- COMMENTI — ELIMINA
-- ════════════════════════════════

CREATE PROCEDURE sp_delete_comment(
  IN p_id INT UNSIGNED
)
BEGIN
  DELETE FROM comments WHERE id = p_id;
END //

-- ════════════════════════════════
-- LIKE — TOGGLE
-- ════════════════════════════════

CREATE PROCEDURE sp_toggle_like(
  IN p_post_id INT UNSIGNED,
  IN p_fingerprint VARCHAR(64)
)
BEGIN
  DECLARE v_existing_id INT UNSIGNED DEFAULT NULL;

  SELECT id INTO v_existing_id
  FROM likes
  WHERE post_id = p_post_id AND fingerprint = p_fingerprint
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM likes WHERE id = v_existing_id;
    SELECT 0 AS liked, (SELECT COUNT(*) FROM likes WHERE post_id = p_post_id) AS total;
  ELSE
    INSERT INTO likes (post_id, fingerprint) VALUES (p_post_id, p_fingerprint);
    SELECT 1 AS liked, (SELECT COUNT(*) FROM likes WHERE post_id = p_post_id) AS total;
  END IF;
END //

-- ════════════════════════════════
-- LIKE — STATO
-- ════════════════════════════════

CREATE PROCEDURE sp_get_like_status(
  IN p_post_id INT UNSIGNED,
  IN p_fingerprint VARCHAR(64)
)
BEGIN
  SELECT
    EXISTS(SELECT 1 FROM likes WHERE post_id = p_post_id AND fingerprint = p_fingerprint) AS liked,
    (SELECT COUNT(*) FROM likes WHERE post_id = p_post_id) AS total;
END //

-- ════════════════════════════════
-- AUTH — LOGIN (trova utente)
-- ════════════════════════════════

CREATE PROCEDURE sp_admin_login(
  IN p_email VARCHAR(255)
)
BEGIN
  SELECT * FROM users WHERE email = p_email LIMIT 1;
END //

-- ════════════════════════════════
-- AUTH — VERIFICA ADMIN
-- ════════════════════════════════

CREATE PROCEDURE sp_verify_admin(
  IN p_user_id INT UNSIGNED
)
BEGIN
  SELECT id, email, role FROM users
  WHERE id = p_user_id AND role = 'admin'
  LIMIT 1;
END //

-- ════════════════════════════════
-- ADMIN — LOG ATTIVITA'
-- ════════════════════════════════

CREATE PROCEDURE sp_insert_admin_log(
  IN p_user_id INT UNSIGNED,
  IN p_action VARCHAR(100),
  IN p_entity_type VARCHAR(50),
  IN p_entity_id INT UNSIGNED,
  IN p_ip_address VARCHAR(45),
  IN p_details JSON
)
BEGIN
  INSERT INTO admin_logs (user_id, action, entity_type, entity_id, ip_address, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_ip_address, p_details);
END //

-- ════════════════════════════════
-- ADMIN — STATISTICHE DASHBOARD
-- ════════════════════════════════

CREATE PROCEDURE sp_get_dashboard_stats()
BEGIN
  SELECT COALESCE(SUM(count),0) AS site_visits_total FROM site_visits;

  SELECT COUNT(*) AS posts_published FROM posts WHERE status = 'published';

  SELECT COUNT(*) AS posts_draft FROM posts WHERE status = 'draft';

  SELECT COUNT(*) AS comments_pending FROM comments WHERE is_approved = 0;

  SELECT COUNT(*) AS total_likes FROM likes;

  SELECT visit_date, count FROM site_visits
  WHERE visit_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  ORDER BY visit_date ASC;

  SELECT p.id, p.title, p.slug, p.type,
         COALESCE(SUM(pv.count),0) AS visits,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comments
  FROM posts p
  LEFT JOIN post_visits pv ON pv.post_id = p.id
  GROUP BY p.id
  ORDER BY visits DESC
  LIMIT 5;
END //

-- ════════════════════════════════
-- ADMIN — LISTA POST COMPLETA
-- ════════════════════════════════

CREATE PROCEDURE sp_get_admin_posts()
BEGIN
  SELECT p.id, p.type, p.title, p.slug, p.status, p.published_at, p.created_at,
         COALESCE(SUM(pv.count),0) AS visits,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 1) AS comments,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_approved = 0) AS pending_comments
  FROM posts p
  LEFT JOIN post_visits pv ON pv.post_id = p.id
  GROUP BY p.id
  ORDER BY p.created_at DESC;
END //

-- ════════════════════════════════
-- ADMIN — TUTTI I COMMENTI
-- ════════════════════════════════

CREATE PROCEDURE sp_get_all_comments()
BEGIN
  SELECT c.*, p.title AS post_title, p.slug AS post_slug
  FROM comments c
  JOIN posts p ON c.post_id = p.id
  ORDER BY c.is_approved ASC, c.created_at DESC
  LIMIT 200;
END //

-- ════════════════════════════════
-- ADMIN — LOG RECENTI
-- ════════════════════════════════

CREATE PROCEDURE sp_get_admin_logs()
BEGIN
  SELECT al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at,
         al.details, u.email AS user_email
  FROM admin_logs al
  LEFT JOIN users u ON al.user_id = u.id
  ORDER BY al.created_at DESC
  LIMIT 100;
END //

-- ════════════════════════════════
-- SETUP — VERIFICA/CREA ADMIN
-- ════════════════════════════════

CREATE PROCEDURE sp_find_user_by_email(
  IN p_email VARCHAR(255)
)
BEGIN
  SELECT id FROM users WHERE email = p_email LIMIT 1;
END //

CREATE PROCEDURE sp_create_admin(
  IN p_email VARCHAR(255),
  IN p_password VARCHAR(255)
)
BEGIN
  INSERT INTO users (email, password, role) VALUES (p_email, p_password, 'admin');
END //

CREATE PROCEDURE sp_update_admin_password(
  IN p_email VARCHAR(255),
  IN p_password VARCHAR(255)
)
BEGIN
  UPDATE users SET password = p_password WHERE email = p_email;
END //

DELIMITER ;

-- ════════════════════════════════
-- INDICI AGGIUNTIVI PER PERFORMANCE
-- ════════════════════════════════

-- Indice composto per query like con fingerprint
CREATE INDEX IF NOT EXISTS idx_likes_post_fingerprint ON likes (post_id, fingerprint);

-- Indice per visite post per data
CREATE INDEX IF NOT EXISTS idx_post_visits_date ON post_visits (post_id, visit_date);

-- Indice per log per data e azione
CREATE INDEX IF NOT EXISTS idx_admin_logs_date_action ON admin_logs (created_at DESC, action);
