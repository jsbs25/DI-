import assert from 'node:assert/strict';
import { getJupiterVideoSource, isRemoteVideoUrl, toJupiterVideoRoute } from '../src/components/browser/videoDocumentUrl.ts';

let passed = 0;
const check = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  passed += 1;
};

const source = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4?source=public';
check(isRemoteVideoUrl(source), 'Accepts an HTTPS video source with a query string');
check(isRemoteVideoUrl('http://example.org/clip.WEBM'), 'Video extension matching is case-insensitive');
check(!isRemoteVideoUrl('https://example.org/article'), 'Does not classify ordinary HTML as video');
check(!isRemoteVideoUrl('https://example.org/recording.mp3'), 'Does not classify audio as video');
check(!isRemoteVideoUrl('data:video/mp4;base64,abc'), 'Rejects non-HTTP video schemes');
check(!isRemoteVideoUrl('https://user:pass@example.org/video.mp4'), 'Rejects credential-bearing URLs');
check(!isRemoteVideoUrl(`https://example.org/${'a'.repeat(2100)}.mp4`), 'Rejects oversized video URLs');

const route = toJupiterVideoRoute(source);
assert.ok(route);
passed += 1;
check(route.startsWith('/jupiter/watch/'), 'Uses the internal JUPITER watch route');
check(getJupiterVideoSource(route) === new URL(source).href, 'Round-trips the encoded video source URL');
check(getJupiterVideoSource('/jupiter/watch/not-a-video') === null, 'Leaves EARTH video IDs to the existing content route');
check(getJupiterVideoSource('/jupiter/watch/%') === null, 'Rejects malformed route encoding');

console.log(`JUPITER video URL routing: ${passed} passed, 0 failed.`);
