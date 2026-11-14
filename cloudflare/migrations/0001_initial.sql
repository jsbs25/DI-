-- EARTH ONE Cloudflare D1 draft migration (initial, NOT applied; not a replacement for live server_data.json)
-- Derived from server/store.ts data model + server/db/schema.sql intent, adapted for SQLite/D1.
-- IMPORTANT: preserve existing IDs/timestamps/relations on import; do not auto-regenerate.
-- Review before applying to any real environment.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  email TEXT,
  email_verified INTEGER DEFAULT 0,
  phone TEXT,
  phone_verified INTEGER DEFAULT 0,
  avatar TEXT,
  banner TEXT,
  bio TEXT,
  country_code TEXT,
  country_name TEXT,
  city_name TEXT,
  lat REAL,
  lng REAL,
  is_public INTEGER DEFAULT 1,
  interests_json TEXT, -- JSON array
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  tips_received INTEGER DEFAULT 0,
  is_online INTEGER DEFAULT 0,
  last_active_at TEXT,
  verified INTEGER DEFAULT 0,
  has_completed_onboarding INTEGER DEFAULT 1,
  joined_at TEXT,
  updated_at TEXT,
  linked_identities_json TEXT, -- JSON array (provider identities)
  extra_json TEXT -- forward-compatible payload for unmapped fields
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_accounts (
  account_key TEXT PRIMARY KEY, -- userId/email/username key as used by store
  user_id TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_id ON auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT,
  expires_at TEXT,
  client_ip TEXT,
  user_agent TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  country_code TEXT,
  country_name TEXT,
  city_name TEXT,
  category TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  extra_json TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- direct/group/global_channel
  name TEXT,
  country_code TEXT,
  participant_ids_json TEXT, -- JSON array preserving order semantics if needed
  admins_json TEXT,
  owner_id TEXT,
  last_message TEXT,
  last_message_time TEXT,
  created_at TEXT,
  updated_at TEXT,
  extra_json TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  client_msg_id TEXT,
  content TEXT,
  attachments_json TEXT,
  reply_to_id TEXT,
  original_language TEXT,
  translated_content TEXT,
  target_language TEXT,
  recalled_at TEXT,
  deleted_for_json TEXT,
  read_by_json TEXT,
  created_at TEXT NOT NULL,
  seq INTEGER,
  extra_json TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_client_msg ON messages(conversation_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  extra_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests(to_user_id, status);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT,
  title TEXT,
  body TEXT,
  read_at TEXT,
  created_at TEXT,
  payload_json TEXT,
  extra_json TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  prefs_json TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS privacy_settings (
  user_id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  initiator_id TEXT,
  kind TEXT,
  scope TEXT,
  status TEXT,
  room_name TEXT,
  provider TEXT,
  created_at TEXT,
  updated_at TEXT,
  ended_at TEXT,
  end_reason TEXT,
  participants_json TEXT,
  extra_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS files_meta (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  conversation_id TEXT,
  object_key TEXT NOT NULL, -- R2 key
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  visibility TEXT, -- private/conversation/public-avatar
  created_at TEXT,
  extra_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_meta_owner ON files_meta(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT,
  author TEXT,
  category TEXT,
  language TEXT,
  year TEXT,
  cover_image TEXT,
  description TEXT,
  epub_url TEXT,
  rights_classification TEXT,
  source TEXT,
  content_object_key TEXT, -- R2 key for books/content/<id>.json when migrated
  created_at TEXT,
  extra_json TEXT
);

CREATE TABLE IF NOT EXISTS bookshelf_items (
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  status TEXT,
  progress REAL,
  current_cfi TEXT,
  updated_at TEXT,
  extra_json TEXT,
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS book_annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter_index INTEGER,
  selected_text TEXT,
  cfi_range TEXT,
  note TEXT,
  ai_summary TEXT,
  created_at TEXT,
  extra_json TEXT
);

CREATE TABLE IF NOT EXISTS security_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT,
  extra_json TEXT
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT
);
-- Use app_state keys: nextEarthSequence, earthIdMap, migration_meta/checksums
