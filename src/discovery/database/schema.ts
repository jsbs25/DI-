export const createResourcesTableSQL = `
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL,
  planet TEXT NOT NULL,
  category TEXT,
  tags TEXT, -- JSON array
  language TEXT,
  country TEXT,
  icon TEXT,
  source TEXT,
  copyright_status TEXT,
  access_type TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_checked_at INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  quality_score INTEGER DEFAULT 0
);
`;

export const createResourcesFTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
  name,
  description,
  domain,
  tags,
  content='resources',
  content_rowid='rowid'
);
`;

export const createResourcesFTS_Triggers_SQL = `
CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
  INSERT INTO resources_fts(rowid, name, description, domain, tags)
  VALUES (new.rowid, new.name, new.description, new.domain, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, name, description, domain, tags)
  VALUES('delete', old.rowid, old.name, old.description, old.domain, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, name, description, domain, tags)
  VALUES('delete', old.rowid, old.name, old.description, old.domain, old.tags);
  INSERT INTO resources_fts(rowid, name, description, domain, tags)
  VALUES (new.rowid, new.name, new.description, new.domain, new.tags);
END;
`;
