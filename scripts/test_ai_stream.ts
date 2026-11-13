import assert from 'node:assert/strict';
import { readAIStream } from '../src/utils/aiStream.ts';

const chunks = [
  '{"delta":"Hello"}\n{"delta":" world"}\n',
  '{"done":true,"tokens":2,"model":"ollama:qwen3:8b"}\n'
];
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  }
});
const deltas: string[] = [];
const result = await readAIStream(new Response(stream), delta => deltas.push(delta));
assert.deepEqual(deltas, ['Hello', ' world']);
assert.deepEqual(result, { tokens: 2, model: 'ollama:qwen3:8b' });

const legacyDeltas: string[] = [];
const legacyResult = await readAIStream(new Response(JSON.stringify({
  success: true,
  reply: '旧版服务也能回复文字。',
  tokens: 12,
  model: 'ollama:qwen3:8b'
}), { headers: { 'Content-Type': 'application/json' } }), delta => legacyDeltas.push(delta));
assert.deepEqual(legacyDeltas, ['旧版服务也能回复文字。']);
assert.deepEqual(legacyResult, { tokens: 12, model: 'ollama:qwen3:8b' });

await assert.rejects(
  readAIStream(new Response(JSON.stringify({ success: false, error: 'Ollama is unavailable.' }), {
    headers: { 'Content-Type': 'application/json' }
  }), () => {}),
  /Ollama is unavailable/
);

const errorStream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('{"error":"Ollama unavailable"}\n'));
    controller.close();
  }
});
await assert.rejects(
  readAIStream(new Response(errorStream), () => {}),
  /Ollama unavailable/
);
await assert.rejects(
  readAIStream(new Response('{"delta":"partial"}\n'), () => {}),
  /ended before completion/
);
console.log('AI streaming client: 6 passed, 0 failed.');
