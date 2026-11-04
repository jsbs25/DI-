import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let childOutput = '';
  let spawnError: Error | undefined;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      EARTH_ONE_DATA_FILE: dataFile,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', error => { spawnError = error; });
  child.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
  child.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });

  async function request(endpoint: string, method = 'GET', payload?: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    return {
      status: response.status,
      body: await response.json() as any
    };
  }

  async function stopServer() {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  let passed = 0;
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`API server exited early.\n${childOutput}`);
      try {
        const health = await request('/api/users');
        if (health.status === 200) { ready = true; break; }
      } catch {
        await sleep(250);
      }
    }
    check(ready, 'Express server becomes ready with isolated storage');

    const anonymousMe = await request('/api/auth/me');
    const anonymousCurrent = await request('/api/auth/current');
    const invalidTokenMe = await request('/api/auth/me', 'GET', undefined, 'invalid-token');
    check(anonymousMe.body.user === null, 'Unauthenticated /api/auth/me returns null');
    check(anonymousCurrent.body.user === null, 'Unauthenticated /api/auth/current returns null');
    check(invalidTokenMe.body.user === null, 'Invalid bearer token cannot read a session');

    const onboardingPayload = {
      displayName: 'Privacy Probe User',
      countryCode: 'JO',
      countryName: 'Jordan',
      cityName: 'Amman',
      isPublic: false,
      bio: 'temporary privacy regression test',
      interests: ['testing']
    };
    check((await request('/api/auth/onboarding', 'POST', onboardingPayload)).status === 401, 'Unauthenticated onboarding is rejected');
    check((await request('/api/auth/update-profile', 'POST', {})).status === 401, 'Unauthenticated profile update is rejected');
    check((await request('/api/auth/toggle-location', 'POST')).status === 401, 'Unauthenticated location toggle is rejected');

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const registration = await request('/api/auth/register', 'POST', {
      email: `privacy-probe-${suffix}@example.test`,
      password: 'TemporaryPrivacyCheck123!',
      displayName: 'Privacy Probe User',
      username: `privacy_probe_${suffix}`
    });
    check(registration.status === 200 && !!registration.body.token, 'Registration provides a valid test session');
    const token = registration.body.token as string;
    const userId = registration.body.user.id as string;
    check((await request('/api/auth/me')).body.user === null, 'Unauthenticated request stays anonymous after another session registers');
    check((await request('/api/auth/me', 'GET', undefined, token)).body.user.email === `privacy-probe-${suffix}@example.test`, 'Valid session can read its own account');
    check((await request('/api/auth/onboarding', 'POST', onboardingPayload)).status === 401, 'Anonymous onboarding cannot target an active account');
    check((await request('/api/auth/update-profile', 'POST', { displayName: 'Unauthorized Change' })).status === 401, 'Anonymous profile update cannot alter an active account');
    check((await request('/api/auth/toggle-location', 'POST')).status === 401, 'Anonymous location toggle cannot alter an active account');

    const onboarding = await request('/api/auth/onboarding', 'POST', onboardingPayload, token);
    check(onboarding.status === 200 && onboarding.body.user.location.isPublic === false, 'Valid session can complete onboarding with private location');
    const updatedProfile = await request('/api/auth/update-profile', 'POST', {
      displayName: 'Privacy Probe Updated',
      bio: 'profile update regression test'
    }, token);
    check(updatedProfile.status === 200 && updatedProfile.body.user.displayName === 'Privacy Probe Updated', 'Valid session can update its own profile');
    const privateNodeList = await request('/api/globe/nodes');
    check(!privateNodeList.body.nodes.some((node: any) => node.userId === userId), 'Private location is omitted from globe nodes');

    const profile = await request(`/api/users/${userId}`);
    const publicUser = profile.body.user;
    check(profile.status === 200 && !('email' in publicUser), 'Public profile omits account email');
    check(!('hasCompletedOnboarding' in publicUser), 'Public profile omits internal onboarding state');
    check(publicUser.location.isPublic === false && publicUser.location.lat === 0 && publicUser.location.lng === 0, 'Public profile masks private coordinates');

    const listedUsers = await request(`/api/users?query=${encodeURIComponent('Privacy Probe')}`);
    const listedUser = listedUsers.body.users.find((user: any) => user.id === userId);
    check(!!listedUser && !('email' in listedUser), 'Public user list omits account email');
    check(listedUser.location.lat === 0 && listedUser.location.lng === 0, 'Public user list masks private coordinates');

    const searchResults = await request(`/api/search/global?q=${encodeURIComponent('Privacy Probe')}`);
    const searchedUser = searchResults.body.results.users.find((user: any) => user.id === userId);
    check(!!searchedUser && !('email' in searchedUser), 'Global search omits account email');
    check(searchedUser.location.lat === 0 && searchedUser.location.lng === 0, 'Global search masks private coordinates');

    const toggledOn = await request('/api/auth/toggle-location', 'POST', undefined, token);
    check(toggledOn.status === 200 && toggledOn.body.isPublic === true, 'Authenticated location toggle enables public sharing');
    const persistedOn = JSON.parse(fs.readFileSync(dataFile, 'utf8')).users.find((user: any) => user.id === userId);
    check(persistedOn.location.isPublic === true, 'Location privacy change is persisted to disk');
    const publicLocation = await request(`/api/users/${userId}`);
    check(publicLocation.body.user.location.lat !== 0 && publicLocation.body.user.location.lng !== 0, 'Consented public city coordinates remain available');

    const toggledOff = await request('/api/auth/toggle-location', 'POST', undefined, token);
    check(toggledOff.status === 200 && toggledOff.body.isPublic === false, 'Authenticated location toggle disables public sharing');
    const finalProfile = await request(`/api/users/${userId}`);
    check(finalProfile.body.user.location.lat === 0 && finalProfile.body.user.location.lng === 0, 'Coordinates are masked again when sharing is disabled');

    console.log(`HTTP API regression: ${passed} passed, 0 failed.`);
  } catch (error) {
    console.error('HTTP API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
