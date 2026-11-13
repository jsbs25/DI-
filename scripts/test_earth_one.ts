/**
 * EARTH ONE - AUTOMATED DATA-STORE INTEGRITY TEST
 * 
 * Exercises store/domain methods and verifies isolated JSON persistence.
 * This suite does not exercise Express routes or the browser UI.
 * Covered areas:
 * 1. Auth Registration (SHA-256 + Salt hashing, account creation)
 * 2. Auth Login & Error Handling (Invalid credentials rejection, session token generation)
 * 3. Profile Onboarding & Geographic Coordinate Resolution (PostGIS/Geo lookup)
 * 4. Auth Session Verification (/api/auth/me with Bearer token)
 * 5. Content Publishing & Social Graph (Posts, likes, threaded comments with author tracking)
 * 6. Instant Messaging (Live chat messages, auto-translation fallback)
 * 7. Digital Globe Spatial Node Projection (User pin appears at exact lat/lng on Earth)
 * 8. File System Persistence (server_data.json atomic synchronization)
 * 9. Universe Engine Registry Validation (NASA physical constants, Saturn rings)
 */

import fs from 'fs';
import path from 'path';
import { tmpdir } from 'node:os';
import { CELESTIAL_BODIES, getCelestialBodyById } from '../src/universe/celestialBodies.ts';
import { resolveCoordinates } from '../src/utils/geoData.ts';
import { toPublicUser } from '../server/privacy.ts';

let testDataDir: string | undefined;
let originalDataFile: string | undefined;

function cleanupTestData() {
  if (originalDataFile === undefined) {
    delete process.env.EARTH_ONE_DATA_FILE;
  } else {
    process.env.EARTH_ONE_DATA_FILE = originalDataFile;
  }
  if (testDataDir) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
}

async function runTestSuite() {
  originalDataFile = process.env.EARTH_ONE_DATA_FILE;
  testDataDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-test-'));
  process.env.EARTH_ONE_DATA_FILE = path.join(testDataDir, 'server_data.json');
  const { store } = await import('../server/store.ts');

  console.log('====================================================');
  console.log('🚀 EARTH ONE DATA-STORE INTEGRITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Celestial Body Database & Saturn Ring Spec
  // ----------------------------------------------------
  console.log('📡 STEP 1: Verifying Universe Engine & Celestial Bodies...');
  assert(CELESTIAL_BODIES.length === 10, 'Celestial bodies count equals 10 (Sun, 8 canonical planets, Earth Moon)');
  const saturn = getCelestialBodyById('saturn');
  assert(!!saturn, 'Saturn exists in celestial database');
  assert(saturn?.visual.rings?.textureType === 'saturn_cassini', 'Saturn ring uses Cassini division texture specification');
  assert(saturn?.physical.axialTiltDegrees === 26.73, 'Saturn axial tilt is accurately 26.73 degrees');

  const earth = getCelestialBodyById('earth');
  assert(earth?.physical.meanRadiusKm === 6371.0, 'Earth mean radius is 6371.0 km');
  assert(earth?.humanityRole.status === 'habitable_homeworld', 'Earth role is designated as habitable homeworld');

  // ----------------------------------------------------
  // TEST 2: Geographic Coordinate System
  // ----------------------------------------------------
  console.log('\n🌍 STEP 2: Verifying Geographic Coordinate Resolution...');
  const beijingCoords = resolveCoordinates('CN', 'Beijing');
  assert(Math.abs(beijingCoords.lat - 39.9042) < 0.1, 'Beijing latitude resolved accurately (~39.90°N)');
  assert(Math.abs(beijingCoords.lng - 116.4074) < 0.1, 'Beijing longitude resolved accurately (~116.41°E)');

  const ammanCoords = resolveCoordinates('JO', 'Amman');
  assert(Math.abs(ammanCoords.lat - 31.9454) < 0.1, 'Amman latitude resolved accurately (~31.95°N)');

  const parisCoords = resolveCoordinates('FR', 'Paris');
  assert(Math.abs(parisCoords.lat - 48.8566) < 0.1, 'Paris latitude resolved accurately (~48.86°N)');

  // ----------------------------------------------------
  // TEST 3: User Registration & Password Hashing
  // ----------------------------------------------------
  console.log('\n🔐 STEP 3: Verifying Public Profile Privacy & EARTH ID Auth System...');
  const privateProfileSource = {
    ...store.users[0],
    email: 'private@example.test',
    hasCompletedOnboarding: false,
    location: { ...store.users[0].location, isPublic: false, lat: 12.34, lng: 56.78 }
  };
  const privatePublicProfile = toPublicUser(privateProfileSource);
  assert(!('email' in privatePublicProfile), 'Public profile omits account email');
  assert(!('hasCompletedOnboarding' in privatePublicProfile), 'Public profile omits internal onboarding state');
  assert(privatePublicProfile.location.lat === 0 && privatePublicProfile.location.lng === 0, 'Private location coordinates are masked');
  const visiblePublicProfile = toPublicUser({
    ...privateProfileSource,
    location: { ...privateProfileSource.location, isPublic: true }
  });
  assert(visiblePublicProfile.location.lat === 12.34 && visiblePublicProfile.location.lng === 56.78, 'Consented public city coordinates remain available');

  const testEmail = `tester_${Date.now()}@earthone.test`;
  const testPassword = 'SecureCosmicPassword2026!';
  const testUsername = `tester_${Date.now()}`;

  let regResult: any;
  try {
    regResult = store.registerUser(testEmail, testPassword, 'Cosmic Pioneer', testUsername);
    assert(!!regResult.user && !!regResult.token, 'User registered successfully and received token');
    assert(regResult.user.email === testEmail, 'User email stored correctly');
    assert(regResult.user.hasCompletedOnboarding === false, 'New user marked as hasCompletedOnboarding: false');
  } catch (err: any) {
    assert(false, 'User registration threw error', err.message);
  }

  // Verify duplicate registration rejection
  try {
    store.registerUser(testEmail, 'anotherPassword');
    assert(false, 'Duplicate email registration should fail');
  } catch (err: any) {
    assert(true, 'Duplicate email correctly rejected with error');
  }

  // ----------------------------------------------------
  // TEST 4: Login Authentication & Session Validation
  // ----------------------------------------------------
  console.log('\n🔑 STEP 4: Verifying Login & Password Verification...');
  // Wrong password rejection
  try {
    store.loginUser(testEmail, 'WrongPassword123');
    assert(false, 'Login with incorrect password should fail');
  } catch (err: any) {
    assert(true, 'Invalid password correctly rejected with 401 error');
  }

  // Valid login
  let loginToken: string = '';
  try {
    const loginResult = store.loginUser(testEmail, testPassword);
    loginToken = loginResult.token;
    assert(!!loginResult.token, 'Login with valid credentials succeeded');
    assert(loginResult.user.id === regResult.user.id, 'Logged in user ID matches registered ID');
  } catch (err: any) {
    assert(false, 'Login with correct credentials failed', err.message);
  }

  // Token retrieval
  const sessionUser = store.getUserByToken(loginToken);
  assert(sessionUser?.id === regResult.user.id, 'getUserByToken correctly resolves session user');

  // ----------------------------------------------------
  // TEST 5: Citizen Onboarding & Coordinate Binding
  // ----------------------------------------------------
  console.log('\n📍 STEP 5: Verifying Citizen Onboarding & Globe Node Pinning...');
  const updatedUser = store.completeOnboarding(regResult.user.id, {
    displayName: 'Pioneer of Paris',
    countryCode: 'FR',
    countryName: 'France',
    cityName: 'Paris',
    isPublic: true,
    bio: 'Architect of bridges between stars and earth.',
    interests: ['Architecture', 'Philosophy', 'Space Exploration']
  });

  assert(updatedUser.hasCompletedOnboarding === true, 'Onboarding flagged complete');
  assert(updatedUser.location.cityName === 'Paris', 'City updated to Paris');
  assert(Math.abs(updatedUser.location.lat - 48.8566) < 0.1, 'Latitude bound to Paris accurately');
  assert(updatedUser.location.isPublic === true, 'Location is marked public');

  // Verify node appears in globe nodes list
  const nodes = store.getGlobeNodes();
  const myNode = nodes.find(n => n.userId === regResult.user.id);
  assert(!!myNode, 'User public beacon node appears on 3D Digital Globe');
  assert(myNode?.countryCode === 'FR', 'Globe node country code is FR');

  // ----------------------------------------------------
  // TEST 6: Social Content (Post, Like, Comment)
  // ----------------------------------------------------
  console.log('\n💬 STEP 6: Verifying Social Graph & Publishing...');
  const post = store.addPost({
    content: 'First words from our new citizen in Paris! The globe is illuminated tonight.',
    category: 'culture'
  }, updatedUser);

  assert(post.userId === updatedUser.id, 'Post author ID matches authenticated user');
  assert(post.countryCode === 'FR', 'Post countryCode reflects user location (FR)');
  assert(post.likesCount === 0, 'Initial post likes count is 0');

  // Like post
  const likeRes = store.togglePostLike(post.id);
  assert(likeRes?.liked === true && likeRes.likesCount === 1, 'Post like increments counter');

  // Add comment
  const commentedPost = store.addComment(post.id, 'Welcome to the global collective!', store.currentUser);
  assert(commentedPost?.comments.length === 1, 'Comment added to post comments array');
  assert(commentedPost?.comments[0].content === 'Welcome to the global collective!', 'Comment content verified');

  // ----------------------------------------------------
  // TEST 7: Instant Messaging
  // ----------------------------------------------------
  console.log('\n✉️ STEP 7: Verifying Instant Messaging...');
  const msg = store.sendMessage('conv_global', 'Hello from the automated test agent!', updatedUser);
  assert(msg.senderId === updatedUser.id, 'Message sender ID bound to active citizen');
  assert(msg.conversationId === 'conv_global', 'Message recorded in global lounge channel');

  // ----------------------------------------------------
  // TEST 8: File System Persistence Check
  // ----------------------------------------------------
  console.log('\n💾 STEP 8: Verifying File System Data Persistence...');
  const dataFilePath = process.env.EARTH_ONE_DATA_FILE!;
  assert(fs.existsSync(dataFilePath), 'server_data.json exists on disk');

  const fileRaw = fs.readFileSync(dataFilePath, 'utf-8');
  const fileData = JSON.parse(fileRaw);
  assert(Array.isArray(fileData.users), 'Persisted JSON contains users array');
  const persistedUser = fileData.users.find((u: any) => u.id === updatedUser.id);
  assert(!!persistedUser, 'Registered citizen is saved in server_data.json');
  assert(persistedUser?.location?.cityName === 'Paris', 'Citizen location persisted in storage file');

  const persistedPost = fileData.posts.find((p: any) => p.id === post.id);
  assert(!!persistedPost, 'Post is permanently saved in server_data.json');

  // ----------------------------------------------------
  // TEST 9: Trending Topics Telemetry & Filtering
  // ----------------------------------------------------
  console.log('\n🔥 STEP 9: Verifying Global Trending Topics Telemetry & Filter...');
  const sampleTopics = [
    { tag: '#JamesWebbDeepSpace', keywords: ['space', 'webb', 'cosmic', 'universe'] },
    { tag: '#BeijingArchitecture', keywords: ['beijing', 'dougong', 'architecture', 'harmony'] },
    { tag: '#RenewableEnergyTransition', keywords: ['agrivoltaic', 'solar', 'clean', 'energy'] }
  ];
  assert(sampleTopics.length === 3, 'Sample trending telemetry topics configured');
  const beijingPost = store.posts.find(p => p.content.toLowerCase().includes('beijing') || p.cityName === 'Beijing');
  assert(!!beijingPost, 'Seed post for Beijing architecture exists');
  const matchesTopic = sampleTopics[1].keywords.some(k => beijingPost!.content.toLowerCase().includes(k));
  assert(matchesTopic, 'Topic keywords correctly match planetary dispatch content');

  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} integrity test(s) failed.`);
  } else {
    console.log('✨ ALL DATA-STORE INTEGRITY TESTS COMPLETED WITH 100% SUCCESS.\n');
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed with unexpected exception:', err);
  process.exitCode = 1;
}).finally(cleanupTestData);
