import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
// @ts-ignore ws types available at runtime
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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-calls-reg-'));
  const dataFile = path.join(testDir, 'server_data.json');
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  let childOutput = '';
  let spawnError: Error | undefined;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), EARTH_ONE_DATA_FILE: dataFile, EARTH_ONE_DISCOVERY_DB_FILE: path.join(testDir, 'discovery.db'), EARTH_ONE_SKIP_BOOK_HARVEST: 'true', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', (e: Error) => { spawnError = e; });
  child.stdout?.on('data', c => { childOutput = (childOutput + c.toString()).slice(-16000); });
  child.stderr?.on('data', c => { childOutput = (childOutput + c.toString()).slice(-16000); });

  async function request(endpoint: string, method = 'GET', payload?: unknown, token?: string) {
    const headers: Record<string, string> = {};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    let body: any = null; const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await res.json(); else body = await res.text();
    return { status: res.status, body };
  }
  async function stopServer() {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await Promise.race([once(child, 'exit'), sleep(4000)]);
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
      }
    } finally { try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {} }
  }
  function wsConnect(token: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error('ws connect timeout')); }, 6000);
      ws.on('open', () => { clearTimeout(t); resolve(ws); });
      ws.on('error', (e: Error) => { clearTimeout(t); reject(e); });
    });
  }
  function wsWait(ws: WebSocket, pred: (d:any)=>boolean, ms=6000): Promise<any> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { cleanup(); reject(new Error('ws wait timeout')); }, ms);
      const onMsg = (raw: any) => { try { const d = JSON.parse(String(raw)); if (pred(d)) { cleanup(); resolve(d); } } catch {} };
      const onErr = (e: Error) => { cleanup(); reject(e); };
      const cleanup = () => { clearTimeout(t); ws.off('message', onMsg); ws.off('error', onErr); };
      ws.on('message', onMsg); ws.on('error', onErr);
    });
  }

  try {
    let ready = false;
    for (let i=0;i<100;i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`server exited early:\n${childOutput}`);
      try { const h = await request('/api/integrations'); if (h.status === 200) { ready = true; break; } } catch {}
      await sleep(200);
    }
    if (!ready) throw new Error(`server not ready:\n${childOutput}`);
    rec('Server boot (isolated)', 'PASS');

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const ra = await request('/api/auth/register', 'POST', { email: `ca_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'CallA', username: `ca_${suffix}` });
    const rb = await request('/api/auth/register', 'POST', { email: `cb_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'CallB', username: `cb_${suffix}` });
    const rc = await request('/api/auth/register', 'POST', { email: `cc_${suffix}@example.test`, password: 'Passw0rd!123', displayName: 'CallC', username: `cc_${suffix}` });
    assert.equal(ra.status,200); assert.equal(rb.status,200); assert.equal(rc.status,200);
    const a = { token: ra.body.token, id: ra.body.user.id }; const b = { token: rb.body.token, id: rb.body.user.id }; const c = { token: rc.body.token, id: rc.body.user.id };

    // befriend a-b for direct call
    const fr = await request('/api/messenger/friend-requests', 'POST', { toUserId: b.id }, a.token);
    await request(`/api/messenger/friend-requests/${fr.body.request.id}/respond`, 'POST', { accept: true }, b.token);
    rec('Setup users/friendship', 'PASS');

    // permission: unauthorized direct call blocked (target restricts strangers / not allowed)
    await request('/api/messenger/privacy', 'PUT', { strangerMessagePolicy: 'friends' }, c.token);
    const nf = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'audio', targetUserId: c.id }, a.token);
    assert.ok(nf.status === 403 || nf.status === 400, `expected forbidden got ${nf.status}`);
    // also blocked-user case
    await request('/api/messenger/privacy', 'PUT', { strangerMessagePolicy: 'everyone' }, c.token);
    await request('/api/messenger/block', 'POST', { userId: c.id }, b.token);
    const blockedCall = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'audio', targetUserId: c.id }, b.token);
    assert.ok(blockedCall.status === 403 || blockedCall.status === 400, `expected forbidden blocked got ${blockedCall.status}`);
    await request('/api/messenger/unblock', 'POST', { userId: c.id }, b.token);
    rec('Direct call unauthorized/blocked cases rejected', 'PASS');

    // direct invite + ws delivery + accept
    let callId = '';
    try {
      const wsA = await wsConnect(a.token); await wsWait(wsA, d=>d.type==='hello');
      const wsB = await wsConnect(b.token); await wsWait(wsB, d=>d.type==='hello');
      const invEvt = wsWait(wsB, d=>d.type==='call_invite' && d.call?.scope==='direct');
      const inv = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'video', targetUserId: b.id }, a.token);
      assert.equal(inv.status, 200); assert.equal(inv.body.success, true);
      callId = inv.body.call.id; assert.ok(callId);
      assert.equal(inv.body.call.status, 'ringing');
      assert.equal(inv.body.media.ok, false); // no LiveKit configured
      assert.equal(inv.body.media.blocked, true);
      assert.equal(inv.body.media.reason, 'MEDIA_NOT_CONFIGURED');
      await invEvt;
      rec('Direct call invite creates record, delivers WS event, media token gated (no secrets/fake)', 'PASS');

      // busy: b tries to invite while ringing -> target busy for a? and a busy
      const busyA = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'audio', targetUserId: b.id }, a.token);
      assert.equal(busyA.status, 409); assert.equal(busyA.body.code, 'BUSY');
      // b cannot accept as non-logic? b accepts
      const accEvtA = wsWait(wsA, d=>d.type==='call_accept' && d.callId===callId);
      const acc = await request(`/api/calls/${callId}/accept`, 'POST', {}, b.token);
      assert.equal(acc.status, 200); assert.equal(acc.body.call.status, 'connecting');
      await accEvtA;
      rec('Busy handling and direct call accept (permissioned)', 'PASS');

      // state updates / reconnecting / active
      const st1 = await request(`/api/calls/${callId}/state`, 'POST', { status: 'active', micEnabled: true, cameraEnabled: false }, b.token);
      assert.equal(st1.status, 200); assert.equal(st1.body.call.status, 'active');
      const st2 = await request(`/api/calls/${callId}/state`, 'POST', { status: 'reconnecting' }, b.token);
      assert.equal(st2.status, 200); assert.equal(st2.body.call.status, 'reconnecting');
      const st3 = await request(`/api/calls/${callId}/state`, 'POST', { status: 'active', screenSharing: true }, b.token);
      assert.equal(st3.status, 200); assert.equal(st3.body.call.status, 'active');
      rec('Call state transitions (active/reconnecting) and device flags recorded', 'PASS');

      // token endpoint gated, no secret exposure
      const tok = await request(`/api/calls/${callId}/token`, 'POST', {}, a.token);
      assert.ok(tok.status === 503 || tok.status === 403, `expected 503/403 got ${tok.status}`);
      assert.equal(tok.body.ok, false);
      assert.ok(!tok.body.token, 'media token must not be issued without config');
      assert.equal(tok.body.blocked, true);
      rec('Short-lived media token endpoint enforces auth+membership and blocks without config', 'PASS');

      // end
      const endEvt = wsWait(wsB, d=>d.type==='call_end' && d.callId===callId);
      const end = await request(`/api/calls/${callId}/end`, 'POST', { reason: 'hangup' }, a.token);
      assert.equal(end.status, 200); assert.equal(end.body.call.status, 'ended');
      await endEvt;
      rec('Call end and event delivery', 'PASS');

      for (const w of [wsA, wsB]) try { w.close(); } catch {}
    } catch (e:any) { rec('Direct call flow (invite/accept/state/end)', 'FAIL', e.message); throw e; }

    // reject flow
    try {
      const inv = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'audio', targetUserId: a.id }, b.token);
      assert.equal(inv.status, 200);
      const rid = inv.body.call.id;
      const rej = await request(`/api/calls/${rid}/reject`, 'POST', {}, a.token);
      assert.equal(rej.status, 200); assert.equal(rej.body.call.status, 'rejected');
      rec('Direct call reject flow', 'PASS');
    } catch (e:any) { rec('Direct call reject flow', 'FAIL', e.message); }

    // unauthorized participant cannot fetch/token/state
    try {
      const inv = await request('/api/calls/invite', 'POST', { scope: 'direct', kind: 'audio', targetUserId: b.id }, a.token);
      const id = inv.body.call.id;
      const nfget = await request(`/api/calls/${id}`, 'GET', undefined, c.token);
      assert.equal(nfget.status, 404);
      const nftok = await request(`/api/calls/${id}/token`, 'POST', {}, c.token);
      assert.equal(nftok.status, 404);
      const nfst = await request(`/api/calls/${id}/state`, 'POST', { status: 'active' }, c.token);
      assert.ok(nfst.status === 403 || nfst.status === 404);
      await request(`/api/calls/${id}/cancel`, 'POST', {}, a.token);
      rec('Non-participant/unauthorized call access rejected', 'PASS');
    } catch (e:any) { rec('Non-participant/unauthorized call access rejected', 'FAIL', e.message); }

    // group call (multi-party signaling/business)
    try {
      const g = await request('/api/conversations/group', 'POST', { name: 'Call Group', memberIds: [b.id, c.id] }, a.token);
      assert.equal(g.status, 200);
      const gid = g.body.conversation.id;
      // remove friendship not required; group permission grants
      const inv = await request('/api/calls/invite', 'POST', { scope: 'group', kind: 'video', conversationId: gid }, a.token);
      assert.equal(inv.status, 200); assert.equal(inv.body.call.scope, 'group');
      assert.ok((inv.body.call.participantIds||[]).length >= 3);
      const cid = inv.body.call.id;
      const accB = await request(`/api/calls/${cid}/accept`, 'POST', {}, b.token);
      assert.equal(accB.status, 200);
      const leaveB = await request(`/api/calls/${cid}/leave`, 'POST', {}, b.token);
      assert.equal(leaveB.status, 200);
      // end by initiator
      await request(`/api/calls/${cid}/end`, 'POST', { reason: 'hangup' }, a.token).catch(()=>{});
      const list = await request('/api/calls', 'GET', undefined, a.token);
      assert.equal(list.status, 200);
      assert.ok((list.body.calls||[]).some((x:any)=>x.id===cid));
      rec('Group/multi-party call signaling, records, and leave/end (business layer)', 'PASS');
    } catch (e:any) { rec('Group/multi-party call signaling, records, and leave/end (business layer)', 'FAIL', e.message); }

    rec('Real two-account bidirectional audio/video media (WebRTC/LiveKit)', 'BLOCKED', 'No local LiveKit/docker runtime and no real browser/media clients in this environment; LiveKit prototype not validated');
    rec('Mic/camera toggle, camera switch, screen share in real media session', 'NOT TESTED', 'Server records device state flags; actual media track control requires real client+media runtime');
    rec('Network interruption/reconnect recovery in real media session', 'NOT TESTED', 'Server supports reconnecting/active state transitions; real network/media recovery requires LiveKit/client runtime');
    rec('Call end resource release in LiveKit/media layer', 'BLOCKED', 'No LiveKit runtime to verify room/media resource teardown');

  } catch (e:any) {
    console.error('RUN ERROR', e?.stack || e);
    rec('Calls regression harness', 'FAIL', e?.message || String(e));
  } finally { await stopServer(); }

  const counts = { PASS:0, FAIL:0, 'NOT TESTED':0, BLOCKED:0 } as Record<string,number>;
  for (const r of results) counts[r.status] = (counts[r.status]||0)+1;
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (counts.FAIL > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
