import assert from 'node:assert/strict';
import { getJupiterImageSource, isRemoteImageUrl, toJupiterImageRoute } from '../src/components/browser/imageDocumentUrl.ts';

let passed = 0;
const check = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  passed += 1;
};

const source = 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg?width=640';
check(isRemoteImageUrl(source), 'Accepts an HTTPS image with a query string');
check(isRemoteImageUrl('http://example.org/photo.WEBP'), 'Image extension matching is case-insensitive');
check(!isRemoteImageUrl('https://example.org/article'), 'Does not classify ordinary HTML as an image');
check(!isRemoteImageUrl('data:image/png;base64,abc'), 'Rejects non-HTTP image schemes');
check(!isRemoteImageUrl('https://user:pass@example.org/image.png'), 'Rejects credential-bearing URLs');
check(!isRemoteImageUrl(`https://example.org/${'a'.repeat(2100)}.jpg`), 'Rejects oversized image URLs');

const route = toJupiterImageRoute(source);
assert.ok(route);
passed += 1;
check(route.startsWith('/jupiter/image/'), 'Uses the internal JUPITER image route');
check(getJupiterImageSource(route) === new URL(source).href, 'Round-trips the encoded image source URL');
check(getJupiterImageSource('/jupiter/image/not-an-image') === null, 'Rejects non-image internal routes');
check(getJupiterImageSource('/jupiter/image/%') === null, 'Rejects malformed route encoding');

console.log(`JUPITER image URL routing: ${passed} passed, 0 failed.`);
