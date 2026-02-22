-- ============================================
-- Schema Database - Danilo Littarru Psicologo
-- ============================================

CREATE DATABASE IF NOT EXISTS littarru_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE littarru_db;

-- ========================
-- TABELLA UTENTI (ADMIN)
-- ========================
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin') NOT NULL DEFAULT 'admin',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- TABELLA POST (ARTICOLI)
-- ========================
CREATE TABLE IF NOT EXISTS posts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36) NOT NULL UNIQUE,
  author_id     INT UNSIGNED NOT NULL,
  type          ENUM('articolo', 'intervista') NOT NULL DEFAULT 'articolo',
  title         VARCHAR(500) NOT NULL,
  slug          VARCHAR(550) NOT NULL UNIQUE,
  excerpt       TEXT,
  content       LONGTEXT NOT NULL,
  cover_image   VARCHAR(500),
  status        ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at  DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY fk_posts_author (author_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_slug (slug),
  INDEX idx_status (status),
  INDEX idx_type (type),
  INDEX idx_published_at (published_at),
  FULLTEXT INDEX ft_posts_search (title, excerpt, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- TABELLA COMMENTI
-- ========================
CREATE TABLE IF NOT EXISTS comments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id       INT UNSIGNED NOT NULL,
  parent_id     INT UNSIGNED DEFAULT NULL,
  author_name   VARCHAR(150) NOT NULL,
  author_email  VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  is_approved   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY fk_comments_post (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY fk_comments_parent (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
  INDEX idx_post_id (post_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_approved (is_approved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- TABELLA LIKE
-- ========================
CREATE TABLE IF NOT EXISTS likes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id      INT UNSIGNED NOT NULL,
  fingerprint  VARCHAR(64) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY fk_likes_post (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_like (post_id, fingerprint),
  INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- VISITE SITO
-- ========================
CREATE TABLE IF NOT EXISTS site_visits (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visit_date   DATE NOT NULL,
  count        INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_visit_date (visit_date),
  INDEX idx_visit_date (visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- VISITE POST
-- ========================
CREATE TABLE IF NOT EXISTS post_visits (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id      INT UNSIGNED NOT NULL,
  visit_date   DATE NOT NULL,
  count        INT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY fk_pv_post (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_post_visit (post_id, visit_date),
  INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- LOG ATTIVITÀ ADMIN
-- ========================
CREATE TABLE IF NOT EXISTS admin_logs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED,
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(50),
  entity_id    INT UNSIGNED,
  details      JSON,
  ip_address   VARCHAR(45),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY fk_logs_user (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================
-- DATI INIZIALI (ADMIN)
-- ========================
-- ATTENZIONE: Questa password è un placeholder.
-- Il vero hash viene generato dal setup script.
-- Non usare questo in produzione.
INSERT IGNORE INTO users (email, password, role) VALUES
('admin@danilolittarru.it', '$PLACEHOLDER_CHANGE_VIA_SETUP_SCRIPT', 'admin');
