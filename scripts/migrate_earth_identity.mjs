#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function normalizeEarthId(v){ if(typeof v!=='string') return null; const s=v.trim().toLowerCase(); return /^earth_\d+$/.test(s)?s:null; }
function seq(e){ const m=/^earth_(\d+)$/.exec(e); return m?parseInt(m[1],10):null; }

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/migrate_earth_identity.mjs <server_data.json> [--apply]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const abs = path.resolve(file);
if (!fs.existsSync(abs)) { console.error('File not found:', abs); process.exit(1); }
const raw = fs.readFileSync(abs,'utf-8');
const data = JSON.parse(raw);
if (!Array.isArray(data.users)) { console.error('Invalid data: users array missing'); process.exit(1); }

const report = { file: abs, applied: apply, users: data.users.length, beforeMissing: 0, assigned: [], errors: [], duplicateEarthIds: [], backup: null };
const used = new Set();
let maxSeq = 100000;
for (const u of data.users) {
  if (!u || typeof u!=='object') continue;
  if (!u.accountStatus) u.accountStatus = 'active';
  const eid = normalizeEarthId(u.earthId);
  if (eid) { u.earthId = eid; used.add(eid); const n=seq(eid); if(n!=null && n>maxSeq) maxSeq=n; }
}
let next = Math.max(Number.isFinite(data.nextEarthSequence)?Math.floor(data.nextEarthSequence):100001, maxSeq+1, 100001);
const missing = data.users.filter(u => u && !normalizeEarthId(u.earthId));
report.beforeMissing = missing.length;
missing.sort((a,b)=>{
  const ta = new Date(a.joinedAt||0).getTime(), tb=new Date(b.joinedAt||0).getTime();
  if (ta!==tb) return ta-tb; return String(a.id||'').localeCompare(String(b.id||''));
});
for (const u of missing) {
  let n=next, eid=`earth_${n++}`; while(used.has(eid)) eid=`earth_${n++}`;
  u.earthId = eid; used.add(eid); next=n;
  report.assigned.push({ id: u.id, username: u.username, earthId: eid });
}
data.nextEarthSequence = next;
data.earthIdMap = data.earthIdMap && typeof data.earthIdMap==='object' ? data.earthIdMap : {};
for (const u of data.users) { if (u?.id && normalizeEarthId(u.earthId)) data.earthIdMap[u.id]=normalizeEarthId(u.earthId); }

// validations
const seen = new Map();
for (const u of data.users) {
  const eid = normalizeEarthId(u.earthId);
  if (!eid) report.errors.push(`missing/invalid earthId for ${u.id}`);
  else if (seen.has(eid)) report.duplicateEarthIds.push({ earthId: eid, a: seen.get(eid), b: u.id });
  else seen.set(eid, u.id);
  if (!u.id) report.errors.push('user missing internal id');
}
report.ok = report.errors.length===0 && report.duplicateEarthIds.length===0;

if (apply) {
  if (!report.ok) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backup = abs + `.bak_earth_identity_${ts}`;
  fs.copyFileSync(abs, backup);
  report.backup = backup;
  const tmp = abs + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data,null,2), 'utf-8');
  fs.renameSync(tmp, abs);
}
console.log(JSON.stringify(report,null,2));
