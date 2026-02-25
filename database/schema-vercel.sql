-- ═══════════════════════════════════════════════════════════
-- Schema PostgreSQL per Vercel Postgres
-- Blog Danilo Littarru — Psicologo
-- ═══════════════════════════════════════════════════════════

-- Tabella utenti admin
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella articoli / interviste
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  uuid CHAR(36) UNIQUE NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type VARCHAR(20) DEFAULT 'articolo' CHECK (type IN ('articolo', 'intervista')),
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(550) UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover_image VARCHAR(500),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice full-text per ricerca (PostgreSQL)
CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING GIN (to_tsvector('italian', title || ' ' || COALESCE(excerpt, '') || ' ' || content));
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

-- Tabella commenti
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  author_name VARCHAR(150) NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_approved ON comments(is_approved);

-- Tabella like (fingerprint anonimo)
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

-- Tabella visite ai singoli post
CREATE TABLE IF NOT EXISTS post_visits (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  count INTEGER DEFAULT 1,
  UNIQUE (post_id, visit_date)
);

-- Tabella visite al sito
CREATE TABLE IF NOT EXISTS site_visits (
  id SERIAL PRIMARY KEY,
  visit_date DATE UNIQUE NOT NULL,
  count INTEGER DEFAULT 1
);

-- Tabella messaggi di contatto
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  subject VARCHAR(100),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella log admin
CREATE TABLE IF NOT EXISTS admin_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- Inserimento admin iniziale
-- CAMBIA email e password prima del deploy!
-- Password hash generato con: bcrypt.hashSync('admin', 12)
-- ═══════════════════════════════════════════════════════════
-- INSERT INTO users (email, password, role)
-- VALUES ('admin', '$2a$12$YOUR_BCRYPT_HASH_HERE', 'admin');
