import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const TEST_USER_ID = 'user_public_profile_probe';
const ALLOWED_ENDPOINTS = new Set([
  '/api/users',
  '/api/users?country=JO',
  '/api/users?country=jo',
  '/api/users?query=archive',
  '/api/users?query=AMMAN',
  '/api/users?query=not-a-match',
  `/api/users/${TEST_USER_ID}`,
  '/api/users/user_missing_profile_probe',
  '/api/search/global?q=Jordan',
  '/api/search/global?q=%20Jordan%20',
  '/api/search/global?q=%20%20'
]);

const privateTestUser = {
  id: TEST_USER_ID,
  username: 'amira_archive',
  displayName: 'Amira Archive',
  email: 'private-profile-probe@example.test',
  hasCompletedOnboarding: false,
  avatar: 'https://example.test/avatar.png',
  banner: 'https://example.test/banner.png',
  bio: 'Archivist researching manuscripts in Amman.',
  location: {
    countryCode: 'JO',
    countryName: 'Jordan',
    cityName: 'Amman',
    lat: 31.9454,
    lng: 35.9284,
    isPublic: false
  },
  interests: ['Archives', 'History'],
  followersCount: 23,
  followingCount: 7,
  tipsReceived: 2,
  isOnline: false,
  verified: false,
  joinedAt: '2026-01-01'
};

const testPost = {
  id: 'post_public_profile_probe',
  userId: TEST_USER_ID,
  content: 'A field note from Amman about preserving public archives.',
  createdAt: '2026-11-04T00:00:00.000Z',
  likesCount: 0,
  commentsCount: 0,
  comments: []
};

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-public-users-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
  fs.writeFileSync(dataFile, JSON.stringify({
    users: [privateTestUser],
    posts: [testPost],
    articles: [],
    videos: [],
    communities: [],
    conversations: [],
    messages: [],
    gameRooms: [],
    ads: [],
    countries: [],
    books: [],
    bookAnnotations: [],
    bookShelf: [],
    crawlerTasks: [],
    crawledPages: [],
    browserBookmarks: [],
    savedArticles: [],
    currentUser: privateTestUser,
    accounts: {},
    sessions: {}
  }, null, 2), 'utf8');

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
    const url = new URL(endpoint, baseUrl);
    const fixedEndpoint = `${url.pathname}${url.search}`;
    assert.ok(ALLOWED_ENDPOINTS.has(fixedEndpoint), `Unexpected endpoint blocked by test: ${fixedEndpoint}`);
    requested.push({ endpoint: fixedEndpoint, method: 'GET' });
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let directory: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        directory = await get('/api/users');
        if (directory.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(directory?.status === 200 && directory.body.success === true, 'Public user directory becomes ready from isolated fixture data');
    const listedUsers = directory?.body.users;
    check(Array.isArray(listedUsers) && listedUsers.length === 1, 'Directory returns only the synthetic profile fixture');
    const listedUser = listedUsers?.[0];
    check(
      listedUser?.id === TEST_USER_ID && listedUser.username === 'amira_archive' &&
      listedUser.displayName === 'Amira Archive' && listedUser.bio.includes('Amman') &&
      listedUser.location.cityName === 'Amman' && Array.isArray(listedUser.interests),
      'Public directory preserves profile identity, biography, location labels, and interests'
    );
    check(
      !('email' in listedUser) && !('hasCompletedOnboarding' in listedUser),
      'Public directory omits private account email and internal onboarding state'
    );
    check(
      listedUser.location.isPublic === false && listedUser.location.lat === 0 && listedUser.location.lng === 0,
      'Public directory keeps the privacy choice while masking private coordinates'
    );
    const repeatedDirectory = await get('/api/users');
    check(
      repeatedDirectory.status === directory?.status &&
      JSON.stringify(repeatedDirectory.body) === JSON.stringify(directory?.body),
      'Repeated public directory GET returns an identical response'
    );

    const jordanUpper = await get('/api/users?country=JO');
    const jordanLower = await get('/api/users?country=jo');
    check(
      jordanUpper.status === 200 && jordanUpper.body.success === true &&
      jordanUpper.body.users.map((user: any) => user.id).join(',') === TEST_USER_ID,
      'Country filter returns the profile matching the uppercase country code'
    );
    check(
      jordanLower.status === 200 && jordanLower.body.users.map((user: any) => user.id).join(',') === TEST_USER_ID,
      'Country filter matches country codes case-insensitively'
    );

    const archiveSearch = await get('/api/users?query=archive');
    const ammanSearch = await get('/api/users?query=AMMAN');
    const emptySearch = await get('/api/users?query=not-a-match');
    check(
      archiveSearch.status === 200 && archiveSearch.body.users.some((user: any) => user.id === TEST_USER_ID),
      'Directory text search matches username, display name, or biography without case sensitivity'
    );
    check(
      ammanSearch.status === 200 && ammanSearch.body.users.some((user: any) => user.id === TEST_USER_ID),
      'Directory text search also matches the public city label'
    );
    check(
      emptySearch.status === 200 && Array.isArray(emptySearch.body.users) && emptySearch.body.users.length === 0,
      'Directory search with no match returns an empty collection'
    );

    const profile = await get(`/api/users/${TEST_USER_ID}`);
    const publicProfile = profile.body.user;
    check(
      profile.status === 200 && profile.body.success === true && publicProfile.id === TEST_USER_ID,
      'Known public profile returns a successful detail response'
    );
    check(
      !('email' in publicProfile) && !('hasCompletedOnboarding' in publicProfile),
      'Public profile omits private account email and internal onboarding state'
    );
    check(
      publicProfile.location.isPublic === false && publicProfile.location.lat === 0 &&
      publicProfile.location.lng === 0 && publicProfile.location.cityName === 'Amman',
      'Public profile masks private coordinates without losing location labels or consent state'
    );
    check(
      Array.isArray(profile.body.posts) && profile.body.posts.length === 1 &&
      profile.body.posts[0].id === 'post_public_profile_probe',
      'Public profile keeps its associated public post list'
    );
    const repeatedProfile = await get(`/api/users/${TEST_USER_ID}`);
    check(
      repeatedProfile.status === profile.status &&
      JSON.stringify(repeatedProfile.body) === JSON.stringify(profile.body),
      'Repeated public profile GET returns an identical response'
    );

    const missingProfile = await get('/api/users/user_missing_profile_probe');
    check(
      missingProfile.status === 404 && missingProfile.body.success === false &&
      missingProfile.body.error === 'User not found',
      'Unknown public profile returns a structured 404'
    );

    const globalSearch = await get('/api/search/global?q=Jordan');
    const globalUser = globalSearch.body.results?.users?.find((user: any) => user.id === TEST_USER_ID);
    check(
      globalSearch.status === 200 && globalSearch.body.success === true &&
      globalSearch.body.query === 'Jordan' && !!globalUser,
      'Global search returns matching public users for a non-empty query'
    );
    check(
      !('email' in globalUser) && !('hasCompletedOnboarding' in globalUser),
      'Global search omits private account email and internal onboarding state'
    );
    check(
      globalUser.location.isPublic === false && globalUser.location.lat === 0 && globalUser.location.lng === 0,
      'Global search masks coordinates for a profile with private location sharing'
    );
    const repeatedGlobalSearch = await get('/api/search/global?q=Jordan');
    check(
      repeatedGlobalSearch.status === globalSearch.status &&
      JSON.stringify(repeatedGlobalSearch.body) === JSON.stringify(globalSearch.body),
      'Repeated global search GET returns an identical response'
    );
    const trimmedGlobalSearch = await get('/api/search/global?q=%20Jordan%20');
    check(
      trimmedGlobalSearch.status === 200 && trimmedGlobalSearch.body.query === 'Jordan' &&
      trimmedGlobalSearch.body.results.users.some((user: any) => user.id === TEST_USER_ID),
      'Global search trims surrounding whitespace and returns the normalized query'
    );
    const emptyGlobalSearch = await get('/api/search/global?q=%20%20');
    check(
      emptyGlobalSearch.status === 400 && emptyGlobalSearch.body.success === false &&
      emptyGlobalSearch.body.error === 'Search query required',
      'Global search rejects a blank query with a structured 400 response'
    );

    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted public directory/profile/search endpoints'
    );

    console.log(`Public users API regression: ${passed} passed, 0 failed (public profile reads only; GET only; isolated synthetic storage).`);
  } catch (error) {
    console.error('Public users API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
