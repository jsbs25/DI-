import assert from 'node:assert/strict';
import { getJupiterAudioSource, isRemoteAudioUrl, toJupiterAudioRoute } from '../src/components/browser/audioDocumentUrl.ts';

let passed = 0;
const check = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  passed += 1;
};

const source = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3?source=public';
check(isRemoteAudioUrl(source), 'Accepts an HTTPS audio source with a query string');
check(isRemoteAudioUrl('http://example.org/recording.OGG'), 'Audio extension matching is case-insensitive');
check(!isRemoteAudioUrl('https://example.org/article'), 'Does not classify ordinary HTML as audio');
check(!isRemoteAudioUrl('https://example.org/video.webm'), 'Does not guess ambiguous video containers as audio');
check(!isRemoteAudioUrl('data:audio/mpeg;base64,abc'), 'Rejects non-HTTP audio schemes');
check(!isRemoteAudioUrl('https://user:pass@example.org/audio.mp3'), 'Rejects credential-bearing URLs');
check(!isRemoteAudioUrl(`https://example.org/${'a'.repeat(2100)}.mp3`), 'Rejects oversized audio URLs');

const route = toJupiterAudioRoute(source);
assert.ok(route);
passed += 1;
check(route.startsWith('/jupiter/audio/'), 'Uses the internal JUPITER audio route');
check(getJupiterAudioSource(route) === new URL(source).href, 'Round-trips the encoded audio source URL');
check(getJupiterAudioSource('/jupiter/audio/not-audio') === null, 'Rejects non-audio internal routes');
check(getJupiterAudioSource('/jupiter/audio/%') === null, 'Rejects malformed route encoding');

console.log(`JUPITER audio URL routing: ${passed} passed, 0 failed.`);
