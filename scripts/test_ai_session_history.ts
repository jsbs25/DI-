import assert from 'node:assert/strict';
import { loadAIConversationHistory, saveAIConversationHistory } from '../src/utils/aiSessionHistory.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});

interface Message {
  id: string;
  text: string;
}

const messages = Array.from({ length: 42 }, (_, index) => ({ id: `message-${index}`, text: `message ${index}` }));
saveAIConversationHistory('chat', messages);
const restored = loadAIConversationHistory('chat', (value): value is Message =>
  !!value && typeof value === 'object' &&
  typeof (value as Message).id === 'string' &&
  typeof (value as Message).text === 'string'
);

assert.equal(restored.length, 40);
assert.equal(restored[0].id, 'message-2');
assert.deepEqual(loadAIConversationHistory('other-chat', (value): value is Message =>
  !!value && typeof value === 'object' &&
  typeof (value as Message).id === 'string' &&
  typeof (value as Message).text === 'string'
), []);
assert.deepEqual(
  loadAIConversationHistory('chat', (value): value is Message => !!value && typeof value === 'object' && 'id' in value),
  messages.slice(-40)
);
console.log('AI tab history persistence: 4 passed, 0 failed.');
