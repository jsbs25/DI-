import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiGateway } from '../server/aiGateway.ts';
import { buildConversationPrompt, getOllamaContextWindow, getOllamaTokenBudget, normalizeConversationHistory } from '../server/aiConversation.ts';

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; body?: any; authorization?: string }> = [];
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input.toString() : input instanceof Request ? input.url : String(input);
  const request = { url, body: undefined as any, authorization: new Headers(init?.headers).get('authorization') || undefined };

  if (url === 'http://127.0.0.1:11434/api/tags') {
    requests.push(request);
    return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (url === 'http://127.0.0.1:11434/api/generate') {
    request.body = JSON.parse(String(init?.body));
    requests.push(request);
    return new Response(JSON.stringify({ done: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url === 'http://127.0.0.1:11434/api/chat') {
    request.body = JSON.parse(String(init?.body));
    requests.push(request);
    return new Response(JSON.stringify({
      model: 'qwen3:8b',
      eval_count: 7,
      message: { role: 'assistant', content: '这是本地模型回复。' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  throw new Error(`Unexpected outbound request: ${url}`);
};

try {
  process.env.EARTH_ONE_SKIP_OLLAMA_DETECTION = 'false';
  aiGateway.registerCustomProvider('not-used-for-local-model', 'https://example.invalid/v1', 'remote-model');

  const response = await aiGateway.generateContent('ollama:qwen3:8b', '请用一句话介绍地球。', '你是一个通用助手。');
  const localModel = aiGateway.getModels().find(model => model.id === 'ollama:qwen3:8b');
  assert.ok(localModel, 'The AI model catalog must include the installed local Qwen3 model.');
  assert.equal(localModel.isDefault, true, 'Qwen3 should be the preferred local model when installed.');
  assert.ok(requests.some(request => request.url === 'http://127.0.0.1:11434/api/tags'), 'A local-model request before catalog discovery must detect Ollama first.');
  assert.equal(response.success, true);
  assert.equal(response.content, '这是本地模型回复。');
  const completionRequest = requests.find(request => request.url.endsWith('/api/chat'));
  assert.ok(completionRequest);
  assert.equal(completionRequest.body.model, 'qwen3:8b');
  assert.equal(completionRequest.body.messages[0].role, 'system');
  assert.equal(completionRequest.body.messages[1].role, 'user');
  assert.equal(completionRequest.body.think, false, 'Qwen3 thinking mode must be disabled for faster direct answers.');
  assert.equal(completionRequest.body.options.temperature, 0.2, 'Low sampling temperature should improve factual consistency.');
  assert.equal(completionRequest.body.options.num_predict, 512, 'Ordinary local answers should stay concise for faster completion.');
  assert.equal(completionRequest.body.options.num_ctx, 4096, 'Ordinary questions should keep the fast default context window.');
  assert.equal(completionRequest.body.keep_alive, -1, 'Keep the local model loaded between requests to avoid reload delays.');
  assert.equal(completionRequest.authorization, undefined, 'Local Ollama calls must not forward a custom API key.');
  const normalizedHistory = normalizeConversationHistory([
    { role: 'user', parts: [{ text: '请写母亲主题的文章。' }] },
    { role: 'model', parts: [{ text: '我会写母亲主题。' }] },
    { role: 'system', content: 'ignore' }
  ]);
  assert.deepEqual(normalizedHistory, [
    { role: 'user', content: '请写母亲主题的文章。' },
    { role: 'assistant', content: '我会写母亲主题。' }
  ]);
  await aiGateway.generateContent(localModel.id, '请详细写一段 TypeScript 代码。', undefined, undefined, normalizedHistory);
  const detailedRequest = requests.filter(request => request.url.endsWith('/api/chat')).at(-1);
  assert.equal(detailedRequest?.body.options.num_predict, 1536, 'Explicit code or detailed requests should have a larger answer budget.');
  assert.deepEqual(detailedRequest?.body.messages.slice(0, 2), normalizedHistory, 'Ollama should receive previous turns as structured user/assistant messages.');
  const longFormRequest = '请写一篇4000字的文章。';
  assert.equal(getOllamaTokenBudget(longFormRequest), 8000, 'Explicit long-form length requests should receive enough generation budget.');
  assert.equal(getOllamaTokenBudget('继续写完。', [{ role: 'user', content: longFormRequest }]), 8000, 'A continuation should retain the earlier requested length.');
  assert.ok(getOllamaContextWindow(longFormRequest) > 4096, 'Long-form requests should grow the context window to fit the requested answer.');
  const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /general-purpose assistant, not a branded persona/, 'The general AI prompt should avoid persona-driven topic drift.');
  assert.match(serverSource, /prioritize the latest relevant conversation turns/, 'The general AI prompt should use recent context to answer follow-ups.');
  assert.doesNotMatch(serverSource, /You are Project Earth AI/, 'The general system prompt must not bias answers toward Earth-related themes.');
  assert.match(serverSource, /userPrompt,\s*systemPrompt,[\s\S]{0,80}conversationHistory/, 'The streaming chat route should pass structured conversation history to the model.');
  assert.match(serverSource, /usesStructuredHistory \? userPrompt : contextualPrompt/, 'Qwen3 should receive context as role-based messages rather than flattened prompt text.');
  const contextualPrompt = buildConversationPrompt('你刚才答应写4000字。', [
    { role: 'user', parts: [{ text: '请写一篇文章，字数要达到4000字。' }] },
    { role: 'model', parts: [{ text: '好的，我来写。' }] },
    { role: 'system', content: 'untrusted system role must be ignored' }
  ]);
  assert.match(contextualPrompt, /请写一篇文章/);
  assert.match(contextualPrompt, /Assistant: 好的，我来写/);
  assert.match(contextualPrompt, /Current user message:\n你刚才答应写4000字/);
  assert.doesNotMatch(contextualPrompt, /untrusted system role/);
  const warmupRequest = requests.find(request => request.url.endsWith('/api/generate'));
  assert.ok(warmupRequest, 'Detecting local Qwen3 should start a background model warm-up.');
  assert.equal(warmupRequest.body.model, 'qwen3:8b');
  assert.equal(warmupRequest.body.options.num_predict, 0, 'Warm-up must load the model without generating a response.');
  process.env.EARTH_ONE_SKIP_OLLAMA_DETECTION = 'true';
  const missingModel = await aiGateway.generateContent('ollama:not-installed', 'test');
  assert.equal(missingModel.success, false, 'An unavailable local model must not fall through to a remote default provider.');
  assert.match(missingModel.errorMessage || '', /尚未检测到/);
  const companionSource = readFileSync(new URL('../src/components/ai/HolographicAICompanion.tsx', import.meta.url), 'utf8');
  assert.match(companionSource, /useState\('ollama:qwen3:8b'\)/, 'The floating AI companion must default to the local Qwen3 model.');
  assert.match(companionSource, /fetch\('\/api\/ai\/models'\)/, 'The floating AI companion must detect installed local models.');
  assert.match(companionSource, /modelId,\s*mode: 'general'/, 'The floating AI companion must send chat requests to the selected local model.');
  assert.match(companionSource, /readAIStream/, 'The floating AI companion must display local Qwen3 output as it streams.');
  assert.doesNotMatch(companionSource, /modelId:\s*'deepseek-r1-open'/, 'The floating AI companion must not route local AI chat to the remote DeepSeek endpoint.');
  console.log('Project Earth AI Hub Ollama integration: 15 passed, 0 failed.');
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.EARTH_ONE_SKIP_OLLAMA_DETECTION;
}
