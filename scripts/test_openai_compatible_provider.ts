import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenAICompatibleProvider } from '../server/ai/providers/openAICompatibleProvider.ts';

const provider = new OpenAICompatibleProvider();
const received: { url?: string; body?: any } = {};
const server = createServer(async (req, res) => {
  received.url = req.url;
  let body = '';
  for await (const chunk of req) body += chunk;
  received.body = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    model: 'local-test-model',
    usage: { total_tokens: 12 },
    choices: [{ message: { role: 'assistant', content: 'hello from local provider' } }]
  }));
});

await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to start test server');

try {
  const result = await provider.generate({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'local-test-model',
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Say hello.' }
    ],
    timeoutMs: 2_000
  });

  assert.equal(received.url, '/v1/chat/completions');
  assert.equal(received.body.model, 'local-test-model');
  assert.equal(received.body.stream, false);
  assert.equal(received.body.messages.length, 2);
  assert.equal(result.content, 'hello from local provider');
  assert.equal(result.tokens, 12);
  assert.equal(result.model, 'local-test-model');
  console.log('OpenAI-compatible provider: 7 passed, 0 failed.');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}
