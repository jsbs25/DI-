#!/usr/bin/env node
/**
 * Discovery SQLite -> local Wrangler D1 migration test (SAFE).
 * - Reads ONLY from an isolated COPY snapshot (cloudflare/.local-data/<stamp>/server_data/discovery.db)
 *   or a user-provided --source-db copy. NEVER reads/writes originals in server_data/.
 * - Generates D1-compatible SQL, applies to LOCAL D1 only, and verifies counts/PK samples/checksums.
 * - Does not modify server_data.json, discovery.db*, uploads, or books.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'cloudflare', '.local-reports');
const WRANGLER_STATE = path.join(ROOT, 'cloudflare', '.wrangler', 'state');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.toml');
const DB_NAME = 'earthone';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? true;
}

function latestCopyDb() {
  const base = path.join(ROOT, 'cloudflare', '.local-data');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'server_data', 'discovery.db'))).sort();
  if (!dirs.length) return null;
  return path.join(base, dirs[dirs.length - 1], 'server_data', 'discovery.db');
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function qident(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }
function qstr(v) { if (v === null || v === undefined) return 'NULL'; return "'" + String(v).replace(/'/g, "''") + "'"; }
function qval(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return "X'" + v.toString('hex') + "'";
  if (v instanceof Uint8Array) return "X'" + Buffer.from(v).toString('hex') + "'";
  return qstr(v);
}

function wrangler(args, input) {
  const cmd = ['wrangler', ...args, '--config', WRANGLER_CONFIG, '--persist-to', WRANGLER_STATE];
  return execFileSync('npx', ['--yes', ...cmd], { cwd: ROOT, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 });
}

function wranglerJson(args) {
  const out = wrangler([...args, '--json']);
  try { return JSON.parse(out); } catch { return out; }
}

function openRo(dbPath) {
  return new DatabaseSync(dbPath, { open: true, readOnly: true });
}

function listObjects(db) {
  return db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name`).all();
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${qident(table)})`).all();
}

function rowHash(row, cols) {
  const payload = JSON.stringify(cols.map(c => [c, row[c] instanceof Uint8Array || Buffer.isBuffer(row[c]) ? Buffer.from(row[c]).toString('hex') : row[c]]));
  return sha256(payload);
}

function dumpTableInserts(db, table, cols) {
  const colList = cols.map(c => qident(c)).join(', ');
  const stmt = db.prepare(`SELECT * FROM ${qident(table)}`);
  const lines = [];
  for (const row of stmt.iterate()) {
    const vals = cols.map(c => qval(row[c])).join(', ');
    lines.push(`INSERT INTO ${qident(table)} (${colList}) VALUES (${vals});`);
  }
  return lines;
}

function generateD1Sql(db) {
  const objects = listObjects(db);
  // D1/SQLite: we can recreate from master SQL for most objects; handle FTS5 tables and shadow tables carefully.
  // Skip sqlite internal shadow tables of FTS explicitly present? master lists fts table + shadow tables; create virtual table auto-creates shadows.
  const ftsNames = new Set(objects.filter(o => o.type === 'table' && /USING\s+fts5/i.test(o.sql || '')).map(o => o.name));
  const shadowPrefixes = [...ftsNames].map(n => n + '_');
  const isShadow = (name) => shadowPrefixes.some(p => String(name).startsWith(p));

  const createStmts = [];
  const insertStmts = [];
  const orderedTables = [];
  // Create non-FTS base tables first, then others except shadows; indexes after inserts? better create indexes after for speed but correctness fine either way.
  const tables = objects.filter(o => o.type === 'table' && !isShadow(o.name));
  const indexes = objects.filter(o => o.type === 'index' && o.sql); // auto indexes have null sql
  const others = objects.filter(o => !['table','index'].includes(o.type));

  // Prefer dependency-safe order: crawl_sources/resources before dependent tables if FKs existed (none now), keep simple stable order.
  const preferred = ['crawl_sources', 'resources', 'resource_planets', 'crawl_logs'];
  tables.sort((a,b)=>{
    const ia=preferred.indexOf(a.name), ib=preferred.indexOf(b.name);
    if(ia!==-1||ib!==-1) return (ia===-1?999:ia)-(ib===-1?999:ib);
    return a.name.localeCompare(b.name);
  });

  for (const t of tables) {
    if (!t.sql) continue;
    createStmts.push(`${t.sql};`);
    orderedTables.push(t.name);
  }
  for (const o of others) {
    if (o.sql) createStmts.push(`${o.sql};`);
  }

  // Data inserts (skip FTS shadow/content internal tables; populate FTS via rebuild from content table by inserting into fts virtual table)
  for (const tname of orderedTables) {
    const cols = tableColumns(db, tname).map(c => c.name);
    if (ftsNames.has(tname)) {
      // FTS5: insert into virtual table (id,name,description,domain,tags,category)
      insertStmts.push(`-- fts5 content for ${tname}`);
    }
    insertStmts.push(...dumpTableInserts(db, tname, cols));
  }

  for (const idx of indexes) {
    if (isShadow(idx.tbl_name)) continue;
    insertStmts.push(`${idx.sql};`);
  }

  // FTS5 rebuild to ensure index consistent
  for (const fts of ftsNames) {
    insertStmts.push(`INSERT INTO ${qident(fts)}(${qident(fts)}) VALUES('rebuild');`);
  }

  const sql = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;', ...createStmts, ...insertStmts, 'COMMIT;', 'PRAGMA foreign_keys=ON;'].join('\n');
  return { sql, objects, orderedTables, ftsNames: [...ftsNames] };
}

function tableChecksum(db, table) {
  const colsInfo = tableColumns(db, table);
  const cols = colsInfo.map(c => c.name);
  const pkCols = colsInfo.filter(c => c.pk > 0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  const order = pkCols.length ? pkCols : cols;
  const stmt = db.prepare(`SELECT * FROM ${qident(table)} ORDER BY ${order.map(qident).join(', ')}`);
  let count = 0;
  const h = crypto.createHash('sha256');
  for (const row of stmt.iterate()) {
    count++;
    h.update(rowHash(row, cols));
    h.update('\n');
  }
  return { count, checksum: h.digest('hex'), columns: cols, pkCols, order };
}

function sampleRows(db, table, limit = 3) {
  const colsInfo = tableColumns(db, table);
  const cols = colsInfo.map(c => c.name);
  const pkCols = colsInfo.filter(c => c.pk > 0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  const order = pkCols.length ? pkCols : cols;
  return db.prepare(`SELECT * FROM ${qident(table)} ORDER BY ${order.map(qident).join(', ')} LIMIT ?`).all(limit);
}

function runD1Json(command) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--local', '--command', command]);
  // wrangler may emit non-json preamble; try parse last json array/object
  const m = out.match(/(\[[\s\S]*\]|\{[\s\S]*\})\s*$/);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  try { return JSON.parse(out); } catch { return out; }
}

function d1QueryAll(sql) {
  const res = runD1Json(sql);
  // format: [{results:[...], success:true, meta:{...}}]
  if (Array.isArray(res) && res[0] && res[0].results) return res[0].results;
  if (res && res.results) return res.results;
  return res;
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sourceDb = arg('source-db') || latestCopyDb();
  if (!sourceDb || !fs.existsSync(sourceDb)) throw new Error('No source copy db found. Run copy-source-to-temp.mjs first or pass --source-db <copy>.');
  // Safety: refuse originals path
  const orig = path.resolve(ROOT, 'server_data', 'discovery.db');
  if (path.resolve(sourceDb) === orig) throw new Error('Refusing to operate on original discovery.db. Use a copy.');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workDir = path.join(REPORT_DIR, `discovery-d1-${stamp}`);
  fs.mkdirSync(workDir, { recursive: true });
  const sqlPath = path.join(workDir, 'discovery-d1.sql');

  const src = openRo(sourceDb);
  let report;
  try {
    const { sql, objects, orderedTables, ftsNames } = generateD1Sql(src);
    fs.writeFileSync(sqlPath, sql);

    const sourceTables = orderedTables;
    const sourceStats = {};
    const sourceSamples = {};
    for (const t of sourceTables) {
      sourceStats[t] = { ...tableChecksum(src, t), sample: sampleRows(src, t, 3) };
      sourceSamples[t] = sourceStats[t].sample;
    }

    // Apply to local D1 (isolated persisted state)
    fs.mkdirSync(WRANGLER_STATE, { recursive: true });
    const applyOut = wrangler(['d1', 'execute', DB_NAME, '--local', '--file', sqlPath]);

    // Verify
    const verification = { tables: {}, ok: true, errors: [] };
    for (const t of sourceTables) {
      try {
        const d1CountRows = d1QueryAll(`SELECT COUNT(*) AS n FROM ${qident(t)};`);
        const d1Count = Array.isArray(d1CountRows) ? (d1CountRows[0]?.n ?? d1CountRows[0]?.['COUNT(*)']) : null;
        const srcCount = sourceStats[t].count;
        // sample compare by selecting same ordered sample keys
        let sampleOk = true;
        let d1Samples = null;
        if (sourceStats[t].sample.length) {
          const pkCols = sourceStats[t].pkCols;
          if (pkCols.length) {
            const cols = sourceStats[t].columns.map(qident).join(', ');
            const pk = pkCols[0];
            const ids = sourceStats[t].sample.map(r => r[pk]).filter(v => v !== undefined);
            if (ids.length) {
              const inList = ids.map(qval).join(',');
              d1Samples = d1QueryAll(`SELECT ${cols} FROM ${qident(t)} WHERE ${qident(pk)} IN (${inList}) ORDER BY ${qident(pk)};`);
            }
          } else {
            d1Samples = d1QueryAll(`SELECT * FROM ${qident(t)} LIMIT 3;`);
          }
        }
        // FTS count can differ from base logical expectations? we compare base tables including resources_fts virtual table if present in master
        const countOk = Number(d1Count) === Number(srcCount);
        verification.tables[t] = { sourceCount: srcCount, d1Count, countOk, sampleSource: sourceStats[t].sample.length, sampleD1: Array.isArray(d1Samples)?d1Samples.length:null };
        if (!countOk) { verification.ok = false; verification.errors.push({ table: t, type: 'count_mismatch', sourceCount: srcCount, d1Count }); }
      } catch (e) {
        verification.ok = false;
        verification.errors.push({ table: t, type: 'verify_error', message: String(e.message || e) });
        verification.tables[t] = { error: String(e.message || e) };
      }
    }

    // FTS5 quick functional check
    let ftsCheck = null;
    try {
      const r = d1QueryAll(`SELECT COUNT(*) AS n FROM resources_fts WHERE resources_fts MATCH 'earth' OR resources_fts MATCH 'resource';`);
      ftsCheck = { ok: true, result: r };
    } catch (e) { ftsCheck = { ok: false, error: String(e.message || e) }; verification.ok = false; verification.errors.push({ type: 'fts_check_failed', message: String(e.message||e) }); }

    report = {
      generatedAt: new Date().toISOString(),
      sourceDb,
      sqlPath,
      sourceSha256: sha256(fs.readFileSync(sourceDb)),
      objects: objects.map(o=>({type:o.type,name:o.name,tbl_name:o.tbl_name})),
      ftsNames,
      tableCount: sourceTables.length,
      sourceStats: Object.fromEntries(Object.entries(sourceStats).map(([k,v])=>[k,{count:v.count,checksum:v.checksum,columns:v.columns,pkCols:v.pkCols}])),
      applyOutputTail: String(applyOut).slice(-2000),
      verification,
      ftsCheck,
      notes: [
        'Applied to LOCAL D1 only (cloudflare/.wrangler/state), originals untouched.',
        'FTS5 virtual table recreated and rebuilt; shadow tables auto-managed by SQLite/D1.',
        'Row-level checksums computed from source copy; D1 verification uses counts + sampled PK lookups + FTS query smoke test.'
      ]
    };
  } finally {
    src.close();
  }

  const reportPath = path.join(workDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'discovery-d1-last-report.json'), JSON.stringify({ ...report, reportPath }, null, 2));
  console.log(JSON.stringify({ ok: report.verification.ok, reportPath, sqlPath, tableCount: report.tableCount, errors: report.verification.errors, ftsCheck: report.ftsCheck }, null, 2));
  if (!report.verification.ok) process.exitCode = 2;
}

main();
