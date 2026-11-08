import Database from 'better-sqlite3';
import { createResourcesTableSQL, createResourcesFTS_SQL, createResourcesFTS_Triggers_SQL } from './schema.js';
import path from 'path';

let db: ReturnType<typeof Database> | null = null;

export function initDiscoveryDatabase(dbPath = path.join(process.cwd(), 'discovery.sqlite')) {
  if (db) return db;
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  // Create tables and triggers
  db.exec(createResourcesTableSQL);
  db.exec(createResourcesFTS_SQL);
  db.exec(createResourcesFTS_Triggers_SQL);

  return db;
}

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDiscoveryDatabase first.');
  }
  return db;
}
