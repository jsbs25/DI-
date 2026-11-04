import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set(['/api/communities', '/api/games/rooms', '/api/ads']);
const GAME_SLUGS = new Set(['chess', 'gomoku', 'trivia']);
const GAME_STATUSES = new Set(['waiting', 'in_progress', 'finished']);
const GAME_TURNS = new Set(['white', 'black', 'player1', 'player2']);
const AD_CATEGORIES = new Set(['global', 'culture', 'tech', 'education']);

async function getAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a local port.');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function main() {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-catalogs-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
  let childOutput = '';
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      EARTH_ONE_DATA_FILE: dataFile,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      CUSTOM_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', error => { childOutput = `${childOutput}\n${error.message}`.slice(-12000); });
  child.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
  child.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });

  async function stopServer() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        const forcedExit = once(child, 'exit');
        child.kill('SIGKILL');
        await forcedExit;
      }
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  let passed = 0;
  const requested: Array<{ endpoint: string; method: string }> = [];
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  async function get(endpoint: string) {
    assert.ok(ALLOWED_ENDPOINTS.has(endpoint), `Unexpected endpoint blocked by test: ${endpoint}`);
    requested.push({ endpoint, method: 'GET' });
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let communitiesResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        communitiesResponse = await get('/api/communities');
        if (communitiesResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      communitiesResponse?.status === 200 && communitiesResponse.body.success === true,
      'Community catalog becomes ready and returns a successful response'
    );
    const communities = communitiesResponse?.body.communities;
    check(Array.isArray(communities) && communities.length > 0, 'Community catalog returns a non-empty collection');
    check(
      Array.isArray(communities) && communities.every((community: any) =>
        typeof community.id === 'string' && community.id.length > 0 &&
        typeof community.name === 'string' && community.name.length > 0 &&
        typeof community.slug === 'string' && community.slug.length > 0 &&
        typeof community.description === 'string' &&
        typeof community.category === 'string' &&
        Number.isInteger(community.membersCount) && community.membersCount >= 0 &&
        typeof community.icon === 'string' &&
        typeof community.banner === 'string' && /^https?:\/\//.test(community.banner) &&
        typeof community.leaderName === 'string' &&
        (community.isJoined === undefined || typeof community.isJoined === 'boolean')
      ),
      'Every community preserves its identity, descriptive, membership, and display fields'
    );
    const communityIds = new Set<string>((communities || []).map((community: any) => community.id));
    const communitySlugs = new Set<string>((communities || []).map((community: any) => community.slug));
    check(
      communityIds.size === (communities?.length || 0) && communitySlugs.size === (communities?.length || 0),
      'Community identifiers and slugs are unique'
    );
    check(
      communityIds.has('comm_1') && communityIds.has('comm_4'),
      'Existing seeded community catalog entries remain present'
    );

    const roomsResponse = await get('/api/games/rooms');
    check(
      roomsResponse.status === 200 && roomsResponse.body.success === true,
      'Game-room listing returns a successful response'
    );
    const rooms = roomsResponse.body.rooms;
    check(Array.isArray(rooms) && rooms.length > 0, 'Game-room listing returns a non-empty collection');
    check(
      Array.isArray(rooms) && rooms.every((room: any) =>
        typeof room.id === 'string' && room.id.length > 0 &&
        GAME_SLUGS.has(room.gameSlug) &&
        typeof room.title === 'string' && room.title.length > 0 &&
        typeof room.host?.id === 'string' &&
        typeof room.host?.displayName === 'string' &&
        typeof room.host?.countryCode === 'string' &&
        typeof room.host?.avatar === 'string' && /^https?:\/\//.test(room.host.avatar) &&
        GAME_STATUSES.has(room.status) &&
        GAME_TURNS.has(room.currentTurn) &&
        room.boardState !== null && typeof room.boardState === 'object'
      ),
      'Every game room preserves its game, host, state, and turn fields'
    );
    const roomIds = new Set<string>((rooms || []).map((room: any) => room.id));
    check(roomIds.size === (rooms?.length || 0), 'Game-room identifiers are unique');
    check(
      roomIds.has('game_1') && roomIds.has('game_2'),
      'Existing seeded chess and Gomoku rooms remain present without joining or changing them'
    );

    const adsResponse = await get('/api/ads');
    check(
      adsResponse.status === 200 && adsResponse.body.success === true,
      'Advertisement catalog returns a successful response'
    );
    const ads = adsResponse.body.ads;
    check(Array.isArray(ads) && ads.length > 0, 'Advertisement catalog returns a non-empty collection');
    check(
      Array.isArray(ads) && ads.every((ad: any) =>
        typeof ad.id === 'string' && ad.id.length > 0 &&
        typeof ad.brand === 'string' && ad.brand.length > 0 &&
        typeof ad.tagline === 'string' &&
        typeof ad.description === 'string' &&
        typeof ad.ctaText === 'string' &&
        typeof ad.ctaUrl === 'string' &&
        typeof ad.imageUrl === 'string' && /^https?:\/\//.test(ad.imageUrl) &&
        AD_CATEGORIES.has(ad.category) &&
        Number.isInteger(ad.impressions) && ad.impressions >= 0 &&
        Number.isInteger(ad.clicks) && ad.clicks >= 0
      ),
      'Every advertisement preserves its display, category, media-reference, and aggregate fields'
    );
    const adIds = new Set<string>((ads || []).map((ad: any) => ad.id));
    check(adIds.size === (ads?.length || 0), 'Advertisement identifiers are unique');
    check(
      adIds.has('ad_1') && adIds.has('ad_2'),
      'Existing seeded advertisement entries remain present without recording a click'
    );
    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted community, room, and ad catalog endpoints'
    );

    console.log(`Catalog API regression: ${passed} passed, 0 failed (community/room/ad lists only; GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Catalog API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
