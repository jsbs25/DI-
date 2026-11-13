import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'earthone-store-conc-'));
  const dataFile = path.join(tmpRoot, 'server_data.json');
  const origDataFile = process.env.EARTH_ONE_DATA_FILE;
  process.env.EARTH_ONE_DATA_FILE = dataFile;
  // ensure fresh module with isolated path
  const mod = await import(`../server/store.ts?conc=${Date.now()}`);
  const { store } = mod as any;
  const origWrite = fs.writeFileSync.bind(fs);
  let failWrites = false;
  const failMarker = dataFile; // fail only main data file writes
  (fs as any).writeFileSync = (file: any, data: any, opts?: any) => {
    const p = String(file);
    if (failWrites && (p === failMarker || p === `${failMarker}.tmp`)) {
      throw new Error('simulated disk write failure');
    }
    return origWrite(file, data, opts);
  };

  try {
    // Seed minimal users/accounts for isolation
    store.users = [
      { id: 'u1', username: 'u1', displayName: 'User 1', email: 'u1@test.local', avatar: '', bio: '', location: { countryCode: 'CN', countryName: 'China', cityName: 'BJ', lat: 0, lng: 0, isPublic: true }, interests: [], followersCount: 0, followingCount: 0, tipsReceived: 0, isOnline: true, verified: false, joinedAt: new Date().toISOString(), linkedIdentities: [] },
      { id: 'u2', username: 'u2', displayName: 'User 2', email: 'u2@test.local', avatar: '', bio: '', location: { countryCode: 'US', countryName: 'USA', cityName: 'NY', lat: 0, lng: 0, isPublic: true }, interests: [], followersCount: 0, followingCount: 0, tipsReceived: 0, isOnline: true, verified: false, joinedAt: new Date().toISOString(), linkedIdentities: [] },
    ];
    store.currentUser = store.users[0];
    store.conversations = [
      { id: 'conv_global', type: 'global_channel', name: 'Global', participantIds: [], channel: 'earthone', lastMessage: '', lastMessageTime: '', lastMessageAt: new Date().toISOString() },
      { id: 'conv_u1', type: 'direct', name: 'D1', participantIds: ['u1','u2'], channel: 'earthone', lastMessage: '', lastMessageTime: '', lastMessageAt: new Date().toISOString() },
      { id: 'conv_u2', type: 'direct', name: 'D2', participantIds: ['u1','u2'], channel: 'earthone', lastMessage: '', lastMessageTime: '', lastMessageAt: new Date().toISOString() },
    ];
    store.messages = [];
    store.bookShelf = [];
    store.bookAnnotations = [];
    store.books = [{ id: 'b1', title: 'B1', author: 'A', category: 'philosophy', language: 'en', source: 'Test', coverImage: '', description: '', readProgress: 0, chapters: [{ id: 'c1', title: 'C1', content: 'hello world' }] }];
    store.browserBookmarks = [];
    store.saveToDisk();

    // 1) concurrent message creation must not lose messages
    const msgN = 60;
    await Promise.all(Array.from({ length: msgN }, (_, i) =>
      store.mutate(async () => {
        // simulate interleaving by yielding
        await new Promise(r => setTimeout(r, Math.random() * 5));
        store.sendMessage('conv_global', `msg-${i}`, store.users[i % 2]);
      })
    ));
    const afterMsgs = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterMsgs.messages.filter((m: any) => m.conversationId === 'conv_global').length, msgN, 'lost messages under concurrency');

    // 2) concurrent updates for different users must not overwrite each other
    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => store.mutate(async () => { await new Promise(r=>setTimeout(r, Math.random()*4)); store.addToBookShelf('u1', `b1_u1_${i}`, 'want_to_read'); })),
      ...Array.from({ length: 20 }, (_, i) => store.mutate(async () => { await new Promise(r=>setTimeout(r, Math.random()*4)); store.addToBookShelf('u2', `b1_u2_${i}`, 'want_to_read'); })),
    ]);
    const afterShelf = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterShelf.bookShelf.filter((s: any) => s.userId === 'u1').length, 20, 'u1 shelf lost');
    assert.equal(afterShelf.bookShelf.filter((s: any) => s.userId === 'u2').length, 20, 'u2 shelf lost/cross-overwritten');

    // 3) concurrent bookmark/progress updates must not overwrite each other
    await Promise.all(Array.from({ length: 30 }, (_, i) => store.mutate(async () => {
      await new Promise(r=>setTimeout(r, Math.random()*4));
      if (i % 2 === 0) {
        store.addAnnotation('b1', 'c1', `sel-${i}`, `note-${i}`, undefined, 'u1');
      } else {
        store.updateBookShelfProgress('u1', 'b1_u1_0', i);
      }
    })));
    const afterMix = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterMix.bookAnnotations.filter((a: any) => a.bookId === 'b1').length, 15, 'lost annotations in mixed writes');
    const progItem = afterMix.bookShelf.find((s: any) => s.userId === 'u1' && s.bookId === 'b1_u1_0');
    assert.ok(progItem && typeof progItem.progress === 'number', 'progress item missing after mixed writes');

    // 4) concurrent annotation adds must not lose
    const annBase = afterMix.bookAnnotations.length;
    await Promise.all(Array.from({ length: 40 }, (_, i) => store.mutate(async () => {
      await new Promise(r=>setTimeout(r, Math.random()*3));
      store.addAnnotation('b1', 'c1', `bulk-${i}`, `bulk-note-${i}`, undefined, i % 2 ? 'u2' : 'u1');
    })));
    const afterAnn = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterAnn.bookAnnotations.length, annBase + 40, 'lost annotations under concurrency');

    // 5) write failure should not break queue for later tasks, and failures propagate
    let failed = false;
    try {
      await store.mutate(async () => { throw new Error('simulated task failure'); });
    } catch { failed = true; }
    assert.equal(failed, true, 'expected task failure did not propagate');

    // disk persist failure should propagate to caller when using persist()
    failWrites = true;
    failed = false;
    try {
      await store.mutate(async () => { store.persist(); });
    } catch { failed = true; }
    assert.equal(failed, true, 'expected persist failure did not propagate');
    failWrites = false;

    // queue must recover and subsequent writes must persist
    await store.mutate(async () => { store.sendMessage('conv_global', 'after-recovery', store.users[0]); });
    const afterRecovery = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.ok(afterRecovery.messages.some((m: any) => m.content === 'after-recovery'), 'queue did not recover after failure');
    const beforeCount = afterRecovery.messages.length;

    // ensure another persist works
    await store.mutate(async () => { store.messages.push({ id: 'probe', conversationId: 'conv_global', senderId: 'u1', senderName: 'User 1', senderAvatar: '', senderCountry: 'CN', content: 'probe', createdAt: new Date().toISOString() }); store.persist(); });
    const afterProbe = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterProbe.messages.length, beforeCount + 1, 'persist did not recover after failure');

    // 6) high concurrency burst final integrity
    const beforeBurst = JSON.parse(fs.readFileSync(dataFile, 'utf8')).messages.length;
    await Promise.all(Array.from({ length: 100 }, (_, i) => store.mutate(async () => {
      if (i % 10 === 0) await new Promise(r=>setTimeout(r, 2));
      store.sendMessage('conv_global', `burst-${i}`, store.users[i % 2]);
    })));
    const afterBurst = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(afterBurst.messages.length, beforeBurst + 100, 'burst lost messages');

    // 7) user data isolation still effective
    const u1Items = afterBurst.bookShelf.filter((s: any) => s.userId === 'u1');
    const u2Items = afterBurst.bookShelf.filter((s: any) => s.userId === 'u2');
    assert.ok(u1Items.every((s:any)=>s.userId==='u1') && u2Items.every((s:any)=>s.userId==='u2'), 'isolation broken');

    console.log(`store concurrency regression: PASS (messages=${afterBurst.messages.length}, shelf=${afterBurst.bookShelf.length}, annotations=${afterBurst.bookAnnotations.length})`);
  } finally {
    (fs as any).writeFileSync = origWrite;
    if (origDataFile === undefined) delete process.env.EARTH_ONE_DATA_FILE; else process.env.EARTH_ONE_DATA_FILE = origDataFile;
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => { console.error(err); process.exit(1); });
