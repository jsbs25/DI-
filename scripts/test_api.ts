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

    const marker = `api-regression-${suffix}`;
    const emptyPost = await request('/api/posts', 'POST', { content: '   ' }, token);
    check(emptyPost.status === 400, 'Empty social post is rejected with a client error');
    const createdPost = await request('/api/posts', 'POST', {
      content: `${marker} community post`,
      category: 'study'
    }, token);
    check(createdPost.status === 200 && createdPost.body.post.userId === userId, 'A valid session can publish a post under its own identity');
    check(createdPost.body.post.category === 'study', 'Post category is preserved in the response');
    const postId = createdPost.body.post.id as string;
    const filteredPosts = await request(`/api/posts?search=${encodeURIComponent(marker)}&country=JO&category=study`);
    check(filteredPosts.body.posts.some((post: any) => post.id === postId), 'Post search, country, and category filters return the matching post');
    const liked = await request(`/api/posts/${postId}/like`, 'POST', {});
    check(liked.status === 200 && liked.body.liked === true && liked.body.likesCount === 1, 'Post like updates its visible count');
    const emptyComment = await request(`/api/posts/${postId}/comment`, 'POST', { content: '' }, token);
    check(emptyComment.status === 400, 'Empty post comment is rejected with a client error');
    const comment = await request(`/api/posts/${postId}/comment`, 'POST', { content: `${marker} comment` }, token);
    check(comment.status === 200 && comment.body.post.commentsCount === 1, 'A valid comment updates the post comment count');
    check(comment.body.post.comments[0].userId === userId, 'Comment author matches the authenticated session');

    const emptyBookSearch = await request('/api/library/search');
    check(emptyBookSearch.status === 400, 'Library search requires a non-empty query without making an external request');
    const books = await request('/api/library/books?search=Plato');
    const republic = books.body.books.find((book: any) => book.id === 'book_republic');
    check(books.status === 200 && !!republic, 'Library search returns the seeded Plato book');
    const bookDetails = await request('/api/library/books/book_republic');
    check(bookDetails.status === 200 && bookDetails.body.book.chapters.length > 0, 'Book detail includes readable chapter content');
    check((await request('/api/library/shelf', 'POST', {}, token)).status === 400, 'Bookshelf rejects a request without a book ID');
    const shelfAdded = await request('/api/library/shelf', 'POST', { bookId: 'book_republic', status: 'reading' }, token);
    check(shelfAdded.status === 200 && shelfAdded.body.item.userId === userId, 'A valid session can add a seeded book to its shelf');
    const shelf = await request('/api/library/shelf', 'GET', undefined, token);
    check(shelf.body.items.some((item: any) => item.bookId === 'book_republic' && item.book.id === 'book_republic'), 'Bookshelf read joins the shelf entry to its book');
    const progress = await request('/api/library/shelf/book_republic/progress', 'POST', { progress: 45 }, token);
    check(progress.status === 200 && progress.body.item.progress === 45, 'Bookshelf reading progress is saved');
    const finished = await request('/api/library/shelf/book_republic/progress', 'POST', { progress: 100 }, token);
    check(finished.body.item.progress === 100 && finished.body.item.status === 'finished', 'Completing a book marks the shelf item finished');
    const shelfRemoved = await request('/api/library/shelf/book_republic', 'DELETE', undefined, token);
    check(shelfRemoved.status === 200 && shelfRemoved.body.success === true, 'Bookshelf entry can be removed');

    const missingBookmarkFields = await request('/api/browser/bookmarks', 'POST', { title: 'Incomplete bookmark' });
    check(missingBookmarkFields.status === 400, 'Bookmark creation requires both title and URL');
    const bookmark = await request('/api/browser/bookmarks', 'POST', {
      title: `${marker} bookmark`,
      url: 'https://example.test/earth-one-regression',
      category: 'Testing'
    });
    check(bookmark.status === 200 && bookmark.body.bookmark.category === 'Testing', 'Bookmark creation preserves its category');
    const bookmarks = await request('/api/browser/bookmarks');
    check(bookmarks.body.bookmarks.some((item: any) => item.id === bookmark.body.bookmark.id), 'Created bookmark appears in the list endpoint');

    const invalidCrawlerTask = await request('/api/crawler/tasks', 'POST', { name: `${marker} task` });
    check(invalidCrawlerTask.status === 400, 'Crawler task validation rejects missing target details');
    const crawlerTask = await request('/api/crawler/tasks', 'POST', {
      name: `${marker} task`,
      targetDomain: 'example.test',
      startUrl: 'https://example.test/earth-one-regression',
      maxPages: 2
    });
    check(crawlerTask.status === 200 && crawlerTask.body.task.status === 'idle', 'Crawler task can be queued without starting a network crawl');
    const crawlerTasks = await request('/api/crawler/tasks');
    check(crawlerTasks.body.tasks.some((task: any) => task.id === crawlerTask.body.task.id), 'Created crawler task appears in the task list');

    const articles = await request('/api/articles');
    check(articles.status === 200 && articles.body.success === true && Array.isArray(articles.body.articles), 'Article listing returns a successful array response');
    check(articles.body.articles.length > 0 && articles.body.articles.some((article: any) => typeof article.id === 'string' && typeof article.title === 'string'), 'Article listing preserves seeded article identifiers and titles');
    const invalidArticle = await request('/api/articles', 'POST', { title: `${marker} incomplete` });
    check(invalidArticle.status === 400 && invalidArticle.body.success === false, 'Article creation rejects a missing content field without writing data');

    const videos = await request('/api/videos');
    check(videos.status === 200 && videos.body.success === true && Array.isArray(videos.body.videos), 'Video listing returns a successful array response');
    check(videos.body.videos.some((video: any) => video.id === 'vid_1' && typeof video.videoUrl === 'string'), 'Video listing preserves the catalog item contract without fetching external media');

    const knowledgeNodes = await request('/api/knowledge/nodes');
    check(knowledgeNodes.status === 200 && knowledgeNodes.body.success === true && knowledgeNodes.body.nodes.some((node: any) => node.id === 'civ_greek'), 'Knowledge graph node listing returns the curated civilization node');
    const civilizationNodes = await request('/api/knowledge/nodes?category=civilization');
    check(civilizationNodes.body.nodes.length > 0 && civilizationNodes.body.nodes.every((node: any) => node.type === 'civilization'), 'Knowledge graph category filter returns only matching node types');
    const saNodes = await request('/api/knowledge/nodes?country=sa');
    check(saNodes.body.nodes.some((node: any) => node.id === 'civ_islamic') && saNodes.body.nodes.every((node: any) => node.countryCode?.toUpperCase() === 'SA'), 'Knowledge graph country filter is case-insensitive and returns matching nodes');
    const searchedKnowledge = await request('/api/knowledge/search?q=Avicenna');
    check(searchedKnowledge.body.nodes.some((node: any) => node.id === 'per_ibn_sina'), 'Knowledge search matches an English alias');
    const filteredKnowledgeSearch = await request('/api/knowledge/search?q=Islamic&category=civilization');
    check(filteredKnowledgeSearch.body.nodes.some((node: any) => node.id === 'civ_islamic') && filteredKnowledgeSearch.body.nodes.every((node: any) => node.type === 'civilization'), 'Knowledge search combines text and category filters');
    const greekCivilization = await request('/api/knowledge/nodes/civ_greek');
    check(greekCivilization.status === 200 && greekCivilization.body.node.id === 'civ_greek', 'Knowledge node detail returns the requested node');
    check(greekCivilization.body.related.some((node: any) => node.id === 'per_plato') && Array.isArray(greekCivilization.body.relatedBooks), 'Knowledge node detail includes related nodes and a related-books array');
    const missingKnowledgeNode = await request('/api/knowledge/nodes/not-a-real-node');
    check(missingKnowledgeNode.status === 404 && missingKnowledgeNode.body.success === false, 'Unknown knowledge node returns a structured 404');

    const communities = await request('/api/communities');
    check(communities.status === 200 && communities.body.success === true && communities.body.communities.some((community: any) => community.id === 'comm_1'), 'Community listing returns the seeded community catalog');
    const gameRooms = await request('/api/games/rooms');
    check(gameRooms.status === 200 && gameRooms.body.success === true && Array.isArray(gameRooms.body.rooms), 'Game room listing returns an array without creating or joining a room');
    const ads = await request('/api/ads');
    check(ads.status === 200 && ads.body.success === true && ads.body.ads.some((ad: any) => ad.id === 'ad_1' && typeof ad.clicks === 'number'), 'Advertisement listing returns the seeded catalog without recording a click');

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
