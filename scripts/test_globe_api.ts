import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set(['/api/globe/countries', '/api/globe/stats']);

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-globe-api-test-'));
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
      GEMINI_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', error => { childOutput = `${childOutput}\n${error.message}`.slice(-12000); });
  child.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
  child.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });

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
  const requestedEndpoints: string[] = [];
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  async function get(endpoint: string) {
    assert.ok(ALLOWED_ENDPOINTS.has(endpoint), `Unexpected endpoint blocked by test: ${endpoint}`);
    requestedEndpoints.push(endpoint);
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let countries: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        countries = await get('/api/globe/countries');
        if (countries.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(countries?.status === 200 && countries.body.success === true, 'Globe country API becomes ready with isolated storage');
    const countryList = countries?.body.countries;
    check(Array.isArray(countryList) && countryList.length > 0, 'Globe country catalog returns a non-empty collection');
    check(
      countryList.every((country: any) =>
        typeof country.code === 'string' && /^[A-Z]{2}$/.test(country.code) &&
        typeof country.name === 'string' && country.name.length > 0 &&
        typeof country.nativeName === 'string' && country.nativeName.length > 0 &&
        Number.isFinite(country.lat) && country.lat >= -90 && country.lat <= 90 &&
        Number.isFinite(country.lng) && country.lng >= -180 && country.lng <= 180
      ) && new Set(countryList.map((country: any) => country.code)).size === countryList.length,
      'Country catalog entries have unique ISO-like codes, localized names, and valid coordinates'
    );
    const jordan = countryList.find((country: any) => country.code === 'JO');
    check(
      jordan?.name === 'Jordan' && typeof jordan.nativeName === 'string' && jordan.nativeName.length > 0 &&
      Number.isFinite(jordan.lat) && Number.isFinite(jordan.lng),
      'Jordan retains English and localized names with numeric coordinates'
    );

    const globeStats = await get('/api/globe/stats');
    check(
      globeStats.status === 200 && globeStats.body.success === true &&
      Number.isFinite(globeStats.body.stats?.countriesCount) && Array.isArray(globeStats.body.stats?.countries),
      'Globe statistics expose a numeric country total and country collection'
    );
    check(
      globeStats.body.stats.countriesCount === countryList.length &&
      globeStats.body.stats.countries.some((country: any) => country.code === 'JO'),
      'Globe statistics match the catalog length and include Jordan'
    );
    check(
      requestedEndpoints.includes('/api/globe/countries') &&
      requestedEndpoints.includes('/api/globe/stats') &&
      requestedEndpoints.every(endpoint => ALLOWED_ENDPOINTS.has(endpoint)),
      'Test accessed only the two allowlisted globe endpoints with GET requests'
    );

    console.log(`Globe API regression: ${passed} passed, 0 failed (GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Globe API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
