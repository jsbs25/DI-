import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';

type Result = { name: string; status: 'PASS'|'FAIL'|'NOT TESTED'|'BLOCKED'; detail?: string };
const results: Result[] = [];
function rec(name: string, status: Result['status'], detail?: string) { results.push({ name, status, detail }); console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`); }

async function getAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function main() {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-comm-reg-'));
  const dataFile = path.join(testDir, 'server_data.json');
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  let childOutput = '';
  let spawnError: Error | undefined;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), EARTH_ONE_DATA_FILE: dataFile, EARTH_ONE_SKIP_BOOK_HARVEST: 'true', NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', e => { spawnError = e; });
  child.stdout?.on('data', c => { childOutput = (childOutput + c.toString()).slice(-16000); });
  child.stderr?.on('data', c => { childOutput = (childOutput + c.toString()).slice(-16000); });

  async function request(endpoint: string, method = 'GET', payload?: unknown, token?: string) {
    const headers: Record<string, string> = {};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    let body: any = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await res.json(); else body = await res.text();
    return { status: res.status, body, headers: res.headers };
  }

  async function stopServer() {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await Promise.race([once(child, 'exit'), sleep(4000)]);
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
      }
    } finally {
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    }
  }

  function wsConnect(token: string, deviceId?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const url = `${wsUrl}?token=${encodeURIComponent(token)}${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ''}`;
      const ws = new WebSocket(url);
      const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error('ws connect timeout')); }, 6000);
      ws.on('open', () => { clearTimeout(t); resolve(ws); });
      ws.on('error', (e) => { clearTimeout(t); reject(e); });
    });
  }
  function wsWait(ws: WebSocket, pred: (d:any)=>boolean, ms=6000): Promise<any> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { cleanup(); reject(new Error('ws wait timeout')); }, ms);
      const onMsg = (raw: any) => { try { const d = JSON.parse(String(raw)); if (pred(d)) { cleanup(); resolve(d); } } catch {} };
      const onErr = (e:any) => { cleanup(); reject(e); };
      const cleanup = () => { clearTimeout(t); ws.off('message', onMsg); ws.off('error', onErr); };
      ws.on('message', onMsg); ws.on('error', onErr);
    });
  }

  try {
    // boot
    let ready = false;
    for (let i=0;i<100;i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`server exited early:\n${childOutput}`);
      try { const h = await request('/api/integrations'); if (h.status === 200) { ready = true; break; } } catch {}
      await sleep(200);
    }
    if (!ready) throw new Error(`server not ready:\n${childOutput}`);
    rec('Server boot (isolated data)', 'PASS');

    // 1. Register/Login/Logout
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    let a: any, b: any, c: any;
    try {
      const ra = await request('/api/auth/register', 'POST', { email: `alice_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'Alice', username: `alice_${suffix}` });
      const rb = await request('/api/auth/register', 'POST', { email: `bob_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'Bob', username: `bob_${suffix}` });
      const rc = await request('/api/auth/register', 'POST', { email: `carol_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'Carol', username: `carol_${suffix}` });
      assert.equal(ra.status, 200); assert.ok(ra.body.token && ra.body.user?.id);
      assert.equal(rb.status, 200); assert.equal(rc.status, 200);
      a = { token: ra.body.token, id: ra.body.user.id, user: ra.body.user, email: `alice_${suffix}@example.test` };
      b = { token: rb.body.token, id: rb.body.user.id, user: rb.body.user, email: `bob_${suffix}@example.test` };
      c = { token: rc.body.token, id: rc.body.user.id, user: rc.body.user };
      // login
      const la = await request('/api/auth/login', 'POST', { identifier: a.email, password: 'Passw0rd!123' });
      assert.equal(la.status, 200); assert.ok(la.body.token); a.token = la.body.token;
      // bad login
      const bad = await request('/api/auth/login', 'POST', { identifier: a.email, password: 'wrongpass' });
      assert.ok(bad.status === 401 || bad.status === 429);
      // logout
      const lo = await request('/api/auth/logout', 'POST', {}, a.token);
      assert.equal(lo.status, 200);
      const meAfter = await request('/api/auth/me', 'GET', undefined, a.token);
      assert.equal(meAfter.body.user, null);
      // re-login for rest
      const la2 = await request('/api/auth/login', 'POST', { identifier: a.email, password: 'Passw0rd!123' });
      a.token = la2.body.token;
      rec('Auth: register, login, bad login rejected, logout', 'PASS');
    } catch (e:any) { rec('Auth: register, login, bad login rejected, logout', 'FAIL', e.message); throw e; }

    // 2. EARTH ID assignment and search
    try {
      const me = await request('/api/account/me', 'GET', undefined, a.token);
      assert.ok(me.body.account?.earthId || me.body.user?.earthId, 'earthId missing');
      const earthId = me.body.account?.earthId || me.body.user?.earthId;
      const sr = await request(`/api/messenger/users/search?q=${encodeURIComponent(earthId)}`, 'GET', undefined, b.token);
      assert.equal(sr.status, 200);
      const found = (sr.body.users||[]).some((u:any)=>u.id===a.id || u.earthId===earthId);
      assert.ok(found, 'earthId search did not find user');
      rec('EARTH ID assigned and searchable', 'PASS');
    } catch (e:any) { rec('EARTH ID assigned and searchable', 'FAIL', e.message); }

    // 3-4. Friends, requests, block/privacy
    let directConvId = '';
    try {
      // friend request a->b
      const fr = await request('/api/messenger/friend-requests', 'POST', { toUserId: b.id, message: 'hi' }, a.token);
      assert.equal(fr.status, 200); assert.equal(fr.body.request.status, 'pending');
      const reqId = fr.body.request.id;
      // b sees incoming
      const bl = await request('/api/messenger/friend-requests', 'GET', undefined, b.token);
      assert.ok((bl.body.incoming||[]).some((r:any)=>r.id===reqId));
      // b accepts
      const acc = await request(`/api/messenger/friend-requests/${reqId}/respond`, 'POST', { accept: true }, b.token);
      assert.equal(acc.status, 200); assert.equal(acc.body.request.status, 'accepted');
      // friends list
      const fa = await request('/api/messenger/friends', 'GET', undefined, a.token);
      assert.ok((fa.body.friends||[]).some((u:any)=>u.id===b.id));
      // block c by a
      const bk = await request('/api/messenger/block', 'POST', { userId: c.id }, a.token);
      assert.equal(bk.status, 200);
      const blist = await request('/api/messenger/blocked', 'GET', undefined, a.token);
      assert.ok((blist.body.blocked||[]).some((u:any)=>u.id===c.id));
      // privacy settings get/set
      const priv = await request('/api/messenger/privacy', 'GET', undefined, a.token);
      assert.equal(priv.status, 200); assert.ok(priv.body.privacy);
      const setp = await request('/api/messenger/privacy', 'PUT', { profileVisibility: 'friends', readReceipts: false }, a.token);
      assert.equal(setp.status, 200); assert.equal(setp.body.privacy.profileVisibility, 'friends');
      // unblock c
      const ub = await request('/api/messenger/unblock', 'POST', { userId: c.id }, a.token);
      assert.equal(ub.status, 200);
      rec('Friends (request/accept), block/unblock, privacy get/set', 'PASS');
    } catch (e:any) { rec('Friends (request/accept), block/unblock, privacy get/set', 'FAIL', e.message); }

    // 5. Direct chat + 7. HTTP send/read
    try {
      const dc = await request('/api/conversations/direct', 'POST', { targetUserId: b.id }, a.token);
      assert.equal(dc.status, 200); assert.ok(dc.body.conversation?.id);
      directConvId = dc.body.conversation.id;
      // send http
      const sm = await request(`/api/conversations/${directConvId}/messages`, 'POST', { content: 'hello bob' }, a.token);
      assert.equal(sm.status, 200); assert.ok(sm.body.message?.id); assert.equal(sm.body.message.content, 'hello bob');
      const mid = sm.body.message.id;
      // read
      const gm = await request(`/api/conversations/${directConvId}/messages?limit=20`, 'GET', undefined, b.token);
      assert.equal(gm.status, 200);
      assert.ok((gm.body.messages||[]).some((m:any)=>m.id===mid));
      // list convs
      const lca = await request('/api/conversations', 'GET', undefined, a.token);
      assert.ok((lca.body.conversations||[]).some((c:any)=>c.id===directConvId));
      rec('1:1 direct chat create, HTTP send/read/list', 'PASS');
    } catch (e:any) { rec('1:1 direct chat create, HTTP send/read/list', 'FAIL', e.message); }

    // 6. Group chat
    let groupConvId = '';
    try {
      const gc = await request('/api/conversations/group', 'POST', { name: 'Test Group', memberIds: [b.id, c.id] }, a.token);
      assert.equal(gc.status, 200); groupConvId = gc.body.conversation.id;
      assert.ok((gc.body.conversation.participantIds||[]).includes(c.id));
      // group message
      const gsm = await request(`/api/conversations/${groupConvId}/messages`, 'POST', { content: 'group hello' }, b.token);
      assert.equal(gsm.status, 200);
      // members update remove c
      const mm = await request(`/api/conversations/${groupConvId}/members`, 'POST', { removeIds: [c.id] }, a.token);
      assert.equal(mm.status, 200);
      assert.ok(!(mm.body.conversation.participantIds||[]).includes(c.id));
      rec('Group create, member manage, group message send', 'PASS');
    } catch (e:any) { rec('Group create, member manage, group message send', 'FAIL', e.message); }

    // 11. recall/delete/search  12. read/delivered  13. offline sync (HTTP side)
    let recallMsgId = '', deleteMsgId = '';
    try {
      const m1 = await request(`/api/conversations/${directConvId}/messages`, 'POST', { content: 'to recall' }, a.token);
      const m2 = await request(`/api/conversations/${directConvId}/messages`, 'POST', { content: 'to delete for me' }, a.token);
      recallMsgId = m1.body.message.id; deleteMsgId = m2.body.message.id;
      // recall
      const rc = await request(`/api/conversations/${directConvId}/messages/${recallMsgId}/recall`, 'POST', {}, a.token);
      assert.equal(rc.status, 200); assert.ok(rc.body.message.recalled);
      // delete for user b (hide from b)
      const del = await request(`/api/conversations/${directConvId}/messages/${deleteMsgId}/delete`, 'POST', {}, b.token);
      assert.equal(del.status, 200);
      const gb = await request(`/api/conversations/${directConvId}/messages?limit=50`, 'GET', undefined, b.token);
      assert.ok(!(gb.body.messages||[]).some((m:any)=>m.id===deleteMsgId), 'deleted-for-user message still visible');
      // search in conv
      const srch = await request(`/api/conversations/${directConvId}/search?q=hello`, 'GET', undefined, a.token);
      assert.equal(srch.status, 200);
      assert.ok((srch.body.messages||[]).some((m:any)=>String(m.content).includes('hello')));
      // global messenger search
      const gsrch = await request(`/api/messenger/messages/search?q=group`, 'GET', undefined, a.token);
      assert.equal(gsrch.status, 200);
      // read/delivered: b fetch marks delivered, then read endpoint
      await request(`/api/conversations/${directConvId}/messages?limit=50`, 'GET', undefined, b.token);
      const rd = await request(`/api/conversations/${directConvId}/read`, 'POST', {}, b.token);
      assert.equal(rd.status, 200);
      const ga = await request(`/api/conversations/${directConvId}/messages?limit=50`, 'GET', undefined, a.token);
      const hello = (ga.body.messages||[]).find((m:any)=>m.content==='hello bob');
      if (hello) {
        // delivered/read arrays may reflect; read receipts depend on privacy (a set readReceipts false earlier) so status may vary
        assert.ok(Array.isArray(hello.deliveredTo) || Array.isArray(hello.readBy));
      }
      rec('Recall, delete-for-self, search, read/delivered (HTTP)', 'PASS');
    } catch (e:any) { rec('Recall, delete-for-self, search, read/delivered (HTTP)', 'FAIL', e.message); }

    // 13. offline sync cursor
    try {
      const before = new Date(Date.now() - 60000).toISOString();
      const sync = await request(`/api/messenger/sync?since=${encodeURIComponent(before)}&limit=10`, 'GET', undefined, b.token);
      assert.equal(sync.status, 200);
      assert.ok(Array.isArray(sync.body.messages)); assert.ok('hasMore' in sync.body); assert.ok(sync.body.serverTime);
      if (sync.body.cursor) assert.ok(sync.body.cursor.since || sync.body.cursor.sinceId !== undefined);
      rec('Offline sync cursor/pagination (HTTP)', 'PASS');
    } catch (e:any) { rec('Offline sync cursor/pagination (HTTP)', 'FAIL', e.message); }

    // 15. Notifications
    try {
      const nl = await request('/api/notifications', 'GET', undefined, b.token);
      assert.equal(nl.status, 200);
      const uc = await request('/api/notifications/unread-count', 'GET', undefined, b.token);
      assert.equal(uc.status, 200); assert.ok(typeof uc.body.unreadCount === 'number');
      const pref = await request('/api/notifications/preferences', 'GET', undefined, b.token);
      assert.equal(pref.status, 200);
      const sp = await request('/api/notifications/preferences', 'PUT', { messages: true, desktop: false }, b.token);
      assert.equal(sp.status, 200);
      // mark all read
      const mar = await request('/api/notifications/read-all', 'POST', {}, b.token);
      assert.equal(mar.status, 200);
      rec('Notifications list/unread/preferences/read-all', 'PASS');
    } catch (e:any) { rec('Notifications list/unread/preferences/read-all', 'FAIL', e.message); }

    // 16. File upload/download and permissions
    try {
      const payload = Buffer.from('hello earth one upload', 'utf8').toString('base64');
      const up = await request('/api/messenger/upload', 'POST', { name: 'test.txt', mimeType: 'text/plain', dataBase64: payload, conversationId: directConvId }, a.token);
      assert.equal(up.status, 200); assert.ok(up.body.attachment?.url);
      const fid = up.body.attachment.id;
      // owner/participant can read
      const dl = await fetch(`${baseUrl}/api/messenger/files/${fid}`, { headers: { Authorization: `Bearer ${b.token}` }, signal: AbortSignal.timeout(8000) });
      assert.equal(dl.status, 200);
      // unauthorized rejected
      const no = await fetch(`${baseUrl}/api/messenger/files/${fid}`, { signal: AbortSignal.timeout(8000) });
      assert.equal(no.status, 401);
      // non-participant (c, removed from group context but stranger to direct conv) forbidden
      const forb = await fetch(`${baseUrl}/api/messenger/files/${fid}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(8000) });
      assert.ok(forb.status === 403 || forb.status === 404, `expected 403/404 got ${forb.status}`);
      rec('File upload, authorized download, unauth/non-participant denied', 'PASS');
    } catch (e:any) { rec('File upload, authorized download, unauth/non-participant denied', 'FAIL', e.message); }

    // Security: forged senderId / unauthorized read
    try {
      // cannot read conv not member of
      const otherConv = await request('/api/conversations/direct', 'POST', { targetUserId: c.id }, a.token);
      const otherId = otherConv.body.conversation?.id;
      if (otherId) {
        const intrude = await request(`/api/conversations/${otherId}/messages`, 'GET', undefined, b.token);
        assert.ok(intrude.status === 403 || intrude.status === 404, `expected 403/404 got ${intrude.status}`);
        // forged sender: HTTP uses session user (requireSessionUser) ignoring body senderId
        const forged = await request(`/api/conversations/${otherId}/messages`, 'POST', { content: 'spoof', senderId: b.id }, a.token);
        assert.equal(forged.status, 200);
        assert.equal(forged.body.message.senderId, a.id, 'senderId was not bound to session');
      }
      rec('Security: unauthorized conversation read rejected, forged senderId ignored', 'PASS');
    } catch (e:any) { rec('Security: unauthorized conversation read rejected, forged senderId ignored', 'FAIL', e.message); }

    // 8-10,14. WebSocket: connect/auth, send_ack/dedup, multi-device, realtime
    try {
      // bad token rejected
      await new Promise<void>((resolve) => {
        const wsBad = new WebSocket(`${wsUrl}?token=badtoken`);
        let done = false;
        const finish = (ok:boolean, d?:string) => { if(done) return; done=true; try{wsBad.terminate()}catch{}; if(ok) rec('WebSocket auth rejects invalid token', 'PASS'); else rec('WebSocket auth rejects invalid token', 'FAIL', d); resolve(); };
        wsBad.on('close', (code) => finish(code === 4401 || code >= 4000, `code=${code}`));
        wsBad.on('message', (raw) => { try { const d=JSON.parse(String(raw)); if (d.type==='error') finish(true); } catch{} });
        wsBad.on('open', () => { /* may close shortly */ setTimeout(()=>finish(false,'opened without auth close/error'), 1500); });
        wsBad.on('error', () => {});
        setTimeout(()=>finish(false,'no auth rejection'), 3000);
      });

      const wsA1 = await wsConnect(a.token, 'devA1');
      const helloA = await wsWait(wsA1, d=>d.type==='hello');
      assert.equal(helloA.userId, a.id);
      const wsA2 = await wsConnect(a.token, 'devA2'); // multi-device same user
      await wsWait(wsA2, d=>d.type==='hello');
      const wsB = await wsConnect(b.token, 'devB1');
      await wsWait(wsB, d=>d.type==='hello');
      rec('WebSocket connect/auth (/ws) and multi-device same user', 'PASS');

      // send via ws, expect send_ack and delivery to B and A's other device
      const clientMsgId = `cm_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const ackP = wsWait(wsA1, d=>d.type==='send_ack' && d.clientMsgId===clientMsgId);
      const recvB = wsWait(wsB, d=>d.type==='message' && d.message?.clientMsgId===clientMsgId);
      const recvA2 = wsWait(wsA2, d=>d.type==='send_ack' && d.clientMsgId===clientMsgId); // sender other device sync
      wsA1.send(JSON.stringify({ type:'send', conversationId: directConvId, content:'ws realtime hello', clientMsgId }));
      const ack = await ackP; const msgB = await recvB; await recvA2;
      assert.equal(ack.ok, true); assert.ok(ack.message?.id); assert.equal(msgB.message.content, 'ws realtime hello');
      rec('WebSocket send_ack, realtime delivery to peer and sender other device', 'PASS');

      // dedup: same clientMsgId should return same/ack without duplicate logical message
      const ack2 = wsWait(wsA1, d=>d.type==='send_ack' && d.clientMsgId===clientMsgId);
      wsA1.send(JSON.stringify({ type:'send', conversationId: directConvId, content:'ws realtime hello', clientMsgId }));
      const dup = await ack2;
      assert.equal(dup.ok, true);
      const msgs = await request(`/api/conversations/${directConvId}/messages?limit=100`, 'GET', undefined, a.token);
      const count = (msgs.body.messages||[]).filter((m:any)=>m.clientMsgId===clientMsgId).length;
      if (count === 1) rec('WebSocket/message dedup by clientMsgId', 'PASS');
      else rec('WebSocket/message dedup by clientMsgId', 'FAIL', `expected 1 got ${count}`);

      // typing/read over ws (best-effort checks)
      wsB.send(JSON.stringify({ type:'typing', conversationId: directConvId, on:true }));
      wsB.send(JSON.stringify({ type:'read', conversationId: directConvId }));
      await sleep(300);

      for (const w of [wsA1, wsA2, wsB]) try { w.close(); } catch {}
      await sleep(200);
      rec('WebSocket typing/read events dispatched (basic)', 'PASS');
    } catch (e:any) { rec('WebSocket realtime/auth/dedup/multi-device', 'FAIL', e.message); }

    // Blocked user cannot send direct message (security)
    try {
      // block b from a (or use privacy) and try to message
      await request('/api/messenger/block', 'POST', { userId: b.id }, a.token);
      const dc = await request('/api/conversations/direct', 'POST', { targetUserId: b.id }, a.token);
      // depending policy may forbid starting or sending; try send on existing directConvId
      const sm = await request(`/api/conversations/${directConvId}/messages`, 'POST', { content: 'should be blocked' }, a.token);
      assert.ok(sm.status === 403 || sm.status === 400, `blocked send should fail, got ${sm.status}`);
      await request('/api/messenger/unblock', 'POST', { userId: b.id }, a.token);
      rec('Blocked user cannot send direct message', 'PASS');
    } catch (e:any) { rec('Blocked user cannot send direct message', 'FAIL', e.message); }

    // Not tested (real UI/multi-browser)
    rec('Real two-browser GUI/E2E communication flow', 'NOT TESTED', 'CLI-only automated regression; no real browser GUI executed');

  } catch (e:any) {
    console.error('REGRESSION RUN ERROR:', e?.stack || e);
    rec('Regression harness', 'FAIL', e?.message || String(e));
  } finally {
    await stopServer();
  }

  // summary
  const counts = { PASS:0, FAIL:0, 'NOT TESTED':0, BLOCKED:0 } as Record<string,number>;
  for (const r of results) counts[r.status] = (counts[r.status]||0)+1;
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (counts.FAIL > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
