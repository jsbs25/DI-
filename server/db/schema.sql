-- ============================================================================
-- EARTH ONE — PostgreSQL + PostGIS Production Schema
-- Phase 2 Database Infrastructure Specification
-- ============================================================================

-- 1. Enable PostGIS Extension for geospatial indexing and spatial queries
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Citizens & Authentication
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- scrypt$salt$hash format
    avatar VARCHAR(512),
    banner VARCHAR(512),
    bio TEXT,
    country_code VARCHAR(8) NOT NULL,
    country_name VARCHAR(128) NOT NULL,
    city_name VARCHAR(128) NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    -- PostGIS geography point (WGS84 SRID 4326)
    location_point GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    is_public BOOLEAN NOT NULL DEFAULT true,
    interests TEXT[] DEFAULT '{}',
    followers_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    tips_received INTEGER NOT NULL DEFAULT 0,
    is_online BOOLEAN NOT NULL DEFAULT false,
    verified BOOLEAN NOT NULL DEFAULT false,
    has_completed_onboarding BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for radius searches (e.g. citizens within 500km)
CREATE INDEX IF NOT EXISTS idx_users_location_point ON users USING GIST (location_point);
CREATE INDEX IF NOT EXISTS idx_users_country ON users (country_code);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 3. Sessions & Tokens
CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_ip VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions (expires_at);

-- 4. Social Feed & Planetary Dispatches
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url VARCHAR(512),
    media_type VARCHAR(32), -- 'image', 'video'
    country_code VARCHAR(8) NOT NULL,
    country_name VARCHAR(128) NOT NULL,
    city_name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'life', -- 'life', 'travel', 'study', 'thought', 'tech', 'culture'
    likes_count INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    shares_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_country ON posts (country_code);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);

-- Post Likes
CREATE TABLE IF NOT EXISTS post_likes (
    post_id VARCHAR(64) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- Post Comments
CREATE TABLE IF NOT EXISTS post_comments (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON post_comments (post_id);

-- 5. Global Communications & Instant Messaging
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- 'direct', 'group', 'global_channel'
    name VARCHAR(255) NOT NULL,
    country_code VARCHAR(8),
    last_message TEXT,
    last_message_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    original_language VARCHAR(16),
    translated_content TEXT,
    target_language VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at DESC);

-- 6. World Library & Catalog Ingestion
CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    language VARCHAR(32) NOT NULL DEFAULT 'zh',
    year VARCHAR(32),
    cover_image VARCHAR(512),
    description TEXT,
    epub_url VARCHAR(512),
    rights_classification VARCHAR(64) NOT NULL DEFAULT 'public_domain',
    source VARCHAR(64) NOT NULL DEFAULT 'standard_library',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_category ON books (category);
CREATE INDEX IF NOT EXISTS idx_books_language ON books (language);
CREATE INDEX IF NOT EXISTS idx_books_title ON books (title);

-- Book Chapters (Separate table or file storage)
CREATE TABLE IF NOT EXISTS book_chapters (
    id VARCHAR(128) PRIMARY KEY,
    book_id VARCHAR(128) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_ref VARCHAR(512) NOT NULL -- Path to content file or s3 key
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON book_chapters (book_id, chapter_index ASC);

-- Citizen Personal Bookshelf
CREATE TABLE IF NOT EXISTS book_shelf (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(128) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'reading', -- 'want_to_read', 'reading', 'finished', 'favorite'
    progress NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    current_cfi VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, book_id)
);

-- Book Annotations & AI Notes
CREATE TABLE IF NOT EXISTS book_annotations (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(128) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    selected_text TEXT NOT NULL,
    cfi_range VARCHAR(255),
    note TEXT,
    ai_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Communities & Planetary Hubs
CREATE TABLE IF NOT EXISTS communities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    category VARCHAR(64) NOT NULL,
    avatar VARCHAR(512),
    banner VARCHAR(512),
    members_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_members (
    community_id VARCHAR(64) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'member', -- 'admin', 'moderator', 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);
