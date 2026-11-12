#!/usr/bin/env node
/**
 * Read-only source data inspection tool for Cloudflare D1 migration.
 * - NEVER writes/modifies source files (server_data.json, server_data/discovery.db*, uploads/books).
 * - Outputs schema/index/fk/integrity/counts/checksums/sample stats and a JSON report.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const SRC_JSON = path.join(ROOT, 'server_data.json');
const SRC_DB = path.join(ROOT, 'server_data', 'discovery.db');
const REPORT_DIR = path.join(ROOT, 'cloudflare', '.local-reports');

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function statSafe(p) {
  if (!fs.existsSync(p)) return { exists: false };
  const s = fs.statSync(p);
  return { exists: true, size: s.size, mtime: s.mtime.toISOString() };
}

function inspectSqlite(dbPath) {
  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    const objects = db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name`).all();
    const tables = objects.filter(o => o.type === 'table' && !String(o.name).startsWith('sqlite_')).map(o => o.name);
    const counts = {};
    const tableInfo = {};
    for (const t of tables) {
      counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n;
      tableInfo[t] = {
        columns: db.prepare(`PRAGMA table_info("${t.replace(/"/g, '""')}")`).all(),
        foreignKeys: db.prepare(`PRAGMA foreign_key_list("${t.replace(/"/g, '""')}")`).all(),
        indexes: db.prepare(`PRAGMA index_list("${t.replace(/"/g, '""')}")`).all(),
      };
    }
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const ftsObjects = objects.filter(o => /fts/i.test(String(o.sql || '') + String(o.name || '')));
    return { objects, counts, tableInfo, fkCheck, integrity, ftsObjects };
  } finally {
    db.close();
  }
}

function sampleRecords(arr, n = 3) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const idxs = [0, Math.floor(arr.length / 2), arr.length - 1].filter((v, i, a) => v >= 0 && v < arr.length && a.indexOf(v) === i);
  for (const i of idxs.slice(0, n)) {
    const item = arr[i];
    if (item && typeof item === 'object') {
      out.push({ index: i, keys: Object.keys(item).slice(0, 20), id: item.id ?? item.token ?? item.userId ?? null });
    } else {
      out.push({ index: i, type: typeof item });
    }
  }
  return out;
}

function inspectJson(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const keys = Object.keys(data).sort();
  const summary = {};
  const samples = {};
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) {
      summary[k] = { type: 'array', count: v.length };
      samples[k] = sampleRecords(v);
    } else if (v && typeof v === 'object') {
      if (v instanceof Map) summary[k] = { type: 'map', count: v.size };
      else summary[k] = { type: 'object', count: Object.keys(v).length };
      samples[k] = sampleRecords(Object.entries(v).map(([key,val]) => ({ key, id: val?.id ?? val?.userId ?? val })));
    } else {
      summary[k] = { type: typeof v, valuePreview: typeof v === 'string' ? v.slice(0, 80) : v };
    }
  }
  return { keys, summary, samples };
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only',
    sources: {
      server_data_json: { path: SRC_JSON, ...statSafe(SRC_JSON), sha256: fs.existsSync(SRC_JSON) ? sha256File(SRC_JSON) : null },
      discovery_db: { path: SRC_DB, ...statSafe(SRC_DB), sha256: fs.existsSync(SRC_DB) ? sha256File(SRC_DB) : null },
      discovery_wal: statSafe(path.join(ROOT, 'server_data', 'discovery.db-wal')),
      discovery_shm: statSafe(path.join(ROOT, 'server_data', 'discovery.db-shm')),
      books_dir: statSafe(path.join(ROOT, 'server_data', 'books')),
      uploads_dir: statSafe(path.join(ROOT, 'server_data', 'uploads')),
    },
  };
  if (fs.existsSync(SRC_JSON)) report.json = inspectJson(SRC_JSON);
  if (fs.existsSync(SRC_DB)) report.sqlite = inspectSqlite(SRC_DB);
  const outPath = path.join(REPORT_DIR, 'source-inspection-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    reportPath: outPath,
    jsonSha256: report.sources.server_data_json.sha256,
    dbSha256: report.sources.discovery_db.sha256,
    jsonSummary: report.json?.summary,
    sqliteCounts: report.sqlite?.counts,
    sqliteIntegrity: report.sqlite?.integrity,
    sqliteFkCheckCount: report.sqlite?.fkCheck?.length,
  }, null, 2));
}

main();
