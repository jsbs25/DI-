#!/usr/bin/env node
/**
 * SAFE local importer: server_data.json (from COPY) -> local Wrangler D1 (0001_initial draft).
 * - Reads only from --source-json (must be inside cloudflare/.local-data copy by default).
 * - NEVER writes/modifies originals (server_data.json, server_data/*, uploads/books).
 * - Writes to LOCAL D1 only via wrangler --local --persist-to cloudflare/.wrangler/state.
 * - Produces counts/checksums/sample verification report; not a production migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function qident(n){return '"'+String(n).replace(/"/g,'""')+'"';}
function qval(v){
  if(v===null||v===undefined) return 'NULL';
  if(typeof v==='number') return Number.isFinite(v)?String(v):'NULL';
  if(typeof v==='boolean') return v?'1':'0';
  if(typeof v==='bigint') return v.toString();
  if(v instanceof Uint8Array || Buffer.isBuffer(v)) return "X'"+Buffer.from(v).toString('hex')+"'";
  return "'"+String(v).replace(/'/g,"''")+"'";
}
function wrangler(args,input){
  return execFileSync('npx',['--yes','wrangler',...args,'--config',WRANGLER_CONFIG,'--persist-to',WRANGLER_STATE],{cwd:ROOT,encoding:'utf8',input,stdio:['pipe','pipe','pipe'],maxBuffer:100*1024*1024});
}
function d1QueryAll(sql){
  const out = wrangler(['d1','execute',DB_NAME,'--local','--command',sql,'--json']);
  let res;
  try{res=JSON.parse(out);}catch{const m=out.match(/(\[[\s\S]*\])\s*$/); res=m?JSON.parse(m[1]):out;}
  if(Array.isArray(res)&&res[0]&&res[0].results) return res[0].results;
  if(res&&res.results) return res.results;
  return res;
}
function latestCopyJson(){
  const base=path.join(ROOT,'cloudflare','.local-data');
  if(!fs.existsSync(base)) return null;
  const dirs=fs.readdirSync(base).filter(d=>fs.existsSync(path.join(base,d,'server_data.json'))).sort();
  if(!dirs.length) return null;
  return path.join(base,dirs[dirs.length-1],'server_data.json');
}
function ensureNotOriginal(p){
  const orig=path.resolve(ROOT,'server_data.json');
  if(path.resolve(p)===orig) throw new Error('Refusing to read original server_data.json; use a copy from cloudflare/.local-data or pass --allow-noncopy with explicit intent (not recommended).');
}
function toJson(v){ return v===undefined?null:JSON.stringify(v); }
function asIntBool(v){ return v?1:0; }

function userRow(u){
  const loc=u.location||{};
  return {
    id:u.id, username:u.username??null, display_name:u.displayName??null, email:u.email??null,
    email_verified:asIntBool(u.emailVerified), phone:u.phone??null, phone_verified:asIntBool(u.phoneVerified),
    avatar:u.avatar??null, banner:u.banner??null, bio:u.bio??null,
    country_code:loc.countryCode??null, country_name:loc.countryName??null, city_name:loc.cityName??null,
    lat: typeof loc.lat==='number'?loc.lat:null, lng: typeof loc.lng==='number'?loc.lng:null,
    is_public: asIntBool(loc.isPublic!==false), interests_json: toJson(u.interests||[]),
    followers_count: u.followersCount??0, following_count: u.followingCount??0, tips_received: u.tipsReceived??0,
    is_online: asIntBool(u.isOnline), last_active_at: u.lastActiveAt??null, verified: asIntBool(u.verified),
    has_completed_onboarding: asIntBool(u.hasCompletedOnboarding!==false), joined_at: u.joinedAt??null,
    updated_at: u.updatedAt??null, linked_identities_json: toJson(u.linkedIdentities||[]),
    extra_json: toJson(u)
  };
}

function insertSql(table, rows){
  if(!rows.length) return '';
  const cols=Object.keys(rows[0]);
  const colList=cols.map(qident).join(', ');
  const stmts=rows.map(r=>`INSERT OR REPLACE INTO ${qident(table)} (${colList}) VALUES (${cols.map(c=>qval(r[c])).join(', ')});`);
  return stmts.join('\n');
}

function chunkedApply(sql, label){
  if(!sql.trim()) return;
  const file = path.join(REPORT_DIR, `.tmp-import-${label}-${Date.now()}.sql`);
  // local D1 via miniflare/DO forbids explicit SQL transactions; execute as statements
  fs.writeFileSync(file, 'PRAGMA foreign_keys=OFF;\n'+sql+'\n');
  try { wrangler(['d1','execute',DB_NAME,'--local','--file',file]); }
  finally { try{fs.unlinkSync(file);}catch{} }
}

function checksumRows(rows, keyFn){
  const h=crypto.createHash('sha256');
  const sorted=[...rows].sort((a,b)=>String(keyFn(a)).localeCompare(String(keyFn(b))));
  for(const r of sorted){ h.update(JSON.stringify(r)); h.update('\n'); }
  return {count:rows.length, checksum:h.digest('hex')};
}

function main(){
  fs.mkdirSync(REPORT_DIR,{recursive:true});
  fs.mkdirSync(WRANGLER_STATE,{recursive:true});
  const sourceJson = arg('source-json') || latestCopyJson();
  if(!sourceJson || !fs.existsSync(sourceJson)) throw new Error('No source json copy found. Run copy-source-to-temp.mjs or pass --source-json <copy>.');
  if(!arg('allow-noncopy')) ensureNotOriginal(sourceJson);

  const raw=fs.readFileSync(sourceJson,'utf8');
  const data=JSON.parse(raw);
  const srcHash=sha256(raw);

  // Apply schema to local test DB (separate concern) - idempotent-ish via IF NOT EXISTS in draft
  wrangler(['d1','execute',DB_NAME,'--local','--file',path.join(ROOT,'cloudflare','migrations','0001_initial.sql')]);

  const users = Array.isArray(data.users)?data.users:[];
  const sessionsObj = data.sessions && typeof data.sessions==='object' ? data.sessions : {};
  const sessionRows = Object.entries(sessionsObj).map(([token,userId])=>({token,user_id:userId,created_at:null,expires_at:null,client_ip:null,user_agent:null}));
  const accountsObj = data.accounts && typeof data.accounts==='object' ? data.accounts : {};
  const accountRows = Object.entries(accountsObj).map(([k,v])=>({
    account_key:k, user_id:v?.userId||v?.user_id||null, email:v?.email||null,
    password_hash:v?.passwordHash||'', salt:v?.salt||'', created_at:null, updated_at:null
  })).filter(r=>r.user_id);

  const posts = Array.isArray(data.posts)?data.posts:[];
  const postRows = posts.map(p=>({id:p.id,user_id:p.userId,content:p.content??null,media_url:p.mediaUrl??null,media_type:p.mediaType??null,country_code:p.countryCode??null,country_name:p.countryName??null,city_name:p.cityName??null,category:p.category??null,likes_count:p.likesCount??0,comments_count:p.commentsCount??0,shares_count:p.sharesCount??0,created_at:p.createdAt??null,updated_at:p.updatedAt??null,extra_json:toJson(p)}));

  const convs = Array.isArray(data.conversations)?data.conversations:[];
  const convRows = convs.map(c=>({id:c.id,type:c.type,name:c.name??null,country_code:c.countryCode??null,participant_ids_json:toJson(c.participantIds||[]),admins_json:toJson(c.admins||[]),owner_id:c.ownerId??null,last_message:c.lastMessage??null,last_message_time:c.lastMessageTime??c.lastMessageAt??null,created_at:c.createdAt??null,updated_at:c.updatedAt??null,extra_json:toJson(c)}));

  const msgs = Array.isArray(data.messages)?data.messages:[];
  const msgRows = msgs.map(m=>({id:m.id,conversation_id:m.conversationId,sender_id:m.senderId,client_msg_id:m.clientMsgId??null,content:m.content??null,attachments_json:toJson(m.attachments||[]),reply_to_id:m.replyToId??null,original_language:m.originalLanguage??null,translated_content:m.translatedContent??null,target_language:m.targetLanguage??null,recalled_at:m.recalledAt??(m.recalled? (m.updatedAt||m.createdAt||'1'):null),deleted_for_json:toJson(m.deletedFor||[]),read_by_json:toJson(m.readBy||[]),created_at:m.createdAt,seq:m.seq??null,extra_json:toJson(m)}));

  const fr = Array.isArray(data.friendRequests)?data.friendRequests:[];
  const frRows = fr.map(r=>({id:r.id,from_user_id:r.fromUserId,to_user_id:r.toUserId,status:r.status,created_at:r.createdAt??null,updated_at:r.updatedAt??null,extra_json:toJson(r)}));

  const blockedBy = data.blockedBy && typeof data.blockedBy==='object' ? data.blockedBy : {};
  const blockRows=[]; for(const [blocker,arr] of Object.entries(blockedBy)){ for(const blocked of (Array.isArray(arr)?arr:[])) blockRows.push({blocker_id:blocker,blocked_id:blocked,created_at:null}); }

  const notifs = Array.isArray(data.notifications)?data.notifications:[];
  const notifRows = notifs.map(n=>({id:n.id,user_id:n.userId,type:n.type??null,title:n.title??null,body:n.body??null,read_at:n.readAt??null,created_at:n.createdAt??null,payload_json:toJson(n.payload??n.data??null),extra_json:toJson(n)}));

  const np = data.notificationPrefs && typeof data.notificationPrefs==='object' ? data.notificationPrefs : {};
  const npRows = Object.entries(np).map(([uid,p])=>({user_id:uid,prefs_json:JSON.stringify(p),updated_at:null}));
  const ps = data.privacySettings && typeof data.privacySettings==='object' ? data.privacySettings : {};
  const psRows = Object.entries(ps).map(([uid,p])=>({user_id:uid,settings_json:JSON.stringify(p),updated_at:null}));

  const calls = Array.isArray(data.calls)?data.calls:[];
  const callRows = calls.map(c=>({id:c.id,conversation_id:c.conversationId??null,initiator_id:c.initiatorId??null,kind:c.kind??null,scope:c.scope??null,status:c.status??null,room_name:c.roomName??null,provider:c.provider??null,created_at:c.createdAt??null,updated_at:c.updatedAt??null,ended_at:c.endedAt??null,end_reason:c.endReason??null,participants_json:toJson(c.participants||[]),extra_json:toJson(c)}));

  const books = Array.isArray(data.books)?data.books:[];
  const bookRows = books.map(b=>({id:b.id,title:b.title??null,author:b.author??null,category:b.category??null,language:b.language??null,year:b.year??null,cover_image:b.coverImage??null,description:b.description??null,epub_url:b.epubUrl??null,rights_classification:b.rightsClassification??null,source:b.source??null,content_object_key:null,created_at:b.createdAt??null,extra_json:toJson(b)}));
  const shelf = Array.isArray(data.bookShelf)?data.bookShelf:[];
  const shelfRows = shelf.map(s=>({user_id:s.userId,book_id:s.bookId,status:s.status??null,progress:s.progress??null,current_cfi:s.currentCfi??null,updated_at:s.updatedAt??null,extra_json:toJson(s)}));
  const ann = Array.isArray(data.bookAnnotations)?data.bookAnnotations:[];
  const annRows = ann.map(a=>({id:a.id,user_id:(a.userId??a.user_id??'__unknown__'),book_id:(a.bookId??a.book_id??'__unknown__'),chapter_index:a.chapterIndex??a.chapter_index??null,selected_text:a.selectedText??a.selected_text??a.text??null,cfi_range:a.cfiRange??a.cfi_range??null,note:a.note??null,ai_summary:a.aiSummary??a.ai_summary??null,created_at:a.createdAt??a.created_at??null,extra_json:toJson(a)}));

  const audit = Array.isArray(data.securityAudit)?data.securityAudit:[];
  const auditRows = audit.map(e=>({id:e.id,user_id:e.userId??null,event:e.event??e.type??null,detail:e.detail??null,ip:e.ip??null,created_at:e.createdAt??null,extra_json:toJson(e)}));

  const appStateRows = [
    {key:'nextEarthSequence', value_json: JSON.stringify(data.nextEarthSequence??null), updated_at:null},
    {key:'earthIdMap', value_json: JSON.stringify(data.earthIdMap??{}), updated_at:null},
    {key:'currentUserId', value_json: JSON.stringify(data.currentUser?.id??null), updated_at:null},
    {key:'lastSavedAt', value_json: JSON.stringify(data.lastSavedAt??null), updated_at:null},
    {key:'source_server_data_sha256', value_json: JSON.stringify(srcHash), updated_at:new Date().toISOString()},
  ];

  // clear target tables for repeatable local test
  const clear = ['security_audit_events','book_annotations','bookshelf_items','books','calls','privacy_settings','notification_preferences','notifications','user_blocks','friend_requests','messages','conversations','posts','sessions','auth_accounts','users','files_meta','app_state']
    .map(t=>`DELETE FROM ${qident(t)};`).join('\n');
  chunkedApply(clear,'clear');

  const userRows = users.map(userRow);
  chunkedApply(insertSql('users', userRows),'users');
  chunkedApply(insertSql('auth_accounts', accountRows),'accounts');
  chunkedApply(insertSql('sessions', sessionRows),'sessions');
  chunkedApply(insertSql('posts', postRows),'posts');
  chunkedApply(insertSql('conversations', convRows),'conversations');
  chunkedApply(insertSql('messages', msgRows),'messages');
  chunkedApply(insertSql('friend_requests', frRows),'friend_requests');
  chunkedApply(insertSql('user_blocks', blockRows),'user_blocks');
  chunkedApply(insertSql('notifications', notifRows),'notifications');
  chunkedApply(insertSql('notification_preferences', npRows),'notification_prefs');
  chunkedApply(insertSql('privacy_settings', psRows),'privacy_settings');
  chunkedApply(insertSql('calls', callRows),'calls');
  chunkedApply(insertSql('books', bookRows),'books');
  chunkedApply(insertSql('bookshelf_items', shelfRows),'bookshelf');
  chunkedApply(insertSql('book_annotations', annRows),'annotations');
  chunkedApply(insertSql('security_audit_events', auditRows),'audit');
  chunkedApply(insertSql('app_state', appStateRows),'app_state');

  const checks = {};
  const expect = {
    users: userRows.length,
    auth_accounts: accountRows.length,
    sessions: sessionRows.length,
    posts: postRows.length,
    conversations: convRows.length,
    messages: msgRows.length,
    friend_requests: frRows.length,
    user_blocks: blockRows.length,
    notifications: notifRows.length,
    notification_preferences: npRows.length,
    privacy_settings: psRows.length,
    calls: callRows.length,
    books: bookRows.length,
    bookshelf_items: shelfRows.length,
    book_annotations: annRows.length,
    security_audit_events: auditRows.length,
  };
  let ok=true; const errors=[];
  for(const [t,n] of Object.entries(expect)){
    const r=d1QueryAll(`SELECT COUNT(*) AS n FROM ${qident(t)};`);
    const got = Array.isArray(r)?(r[0]?.n ?? 0):0;
    const pass = Number(got)===Number(n);
    checks[t]={expected:n,got,countOk:pass};
    if(!pass){ok=false; errors.push({table:t,expected:n,got});}
  }
  // sample checks
  const sample = {
    user: users[0]? d1QueryAll(`SELECT id,username,email,phone,has_completed_onboarding FROM users WHERE id=${qval(users[0].id)};`):null,
    session: sessionRows[0]? d1QueryAll(`SELECT token,user_id FROM sessions WHERE token=${qval(sessionRows[0].token)};`):null,
    message: msgRows[0]? d1QueryAll(`SELECT id,conversation_id,sender_id,created_at FROM messages WHERE id=${qval(msgRows[0].id)};`):null,
  };
  const appState = d1QueryAll(`SELECT key,value_json FROM app_state;`);
  const report={
    generatedAt:new Date().toISOString(), sourceJson, sourceSha256:srcHash, expect, checks, errors, ok,
    sourceChecksums:{
      users: checksumRows(users, r=>r.id),
      sessions: checksumRows(sessionRows, r=>r.token),
      messages: checksumRows(msgs, r=>r.id),
      conversations: checksumRows(convs, r=>r.id),
    },
    samples: sample, appState,
    notes:[
      'Imported from COPY only into LOCAL D1 (.wrangler/state). Originals untouched.',
      'Draft schema mapping: core identity/auth/session/social/messenger/book/audit/app_state covered; unmapped/complex fields preserved in extra_json.',
      'Not applied to Cloudflare remote; no production data modified.'
    ]
  };
  const outPath=path.join(REPORT_DIR, `json-d1-import-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(REPORT_DIR,'json-d1-import-last.json'), JSON.stringify({...report,reportPath:outPath},null,2));
  console.log(JSON.stringify({ok, reportPath:outPath, expect, errors, sampleKeys:Object.keys(sample)},null,2));
  if(!ok) process.exitCode=2;
}
main();
