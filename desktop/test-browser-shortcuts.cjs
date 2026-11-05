'use strict';

const assert = require('node:assert/strict');
const { getBrowserShortcut } = require('./browser-shortcuts.cjs');

const shortcut = (keyCode, modifiers, extra = {}) => getBrowserShortcut({ type: 'keyDown', keyCode, modifiers, ...extra });
assert.deepEqual(shortcut('T', ['control']), { action: 'new-tab' });
assert.deepEqual(shortcut('W', ['meta']), { action: 'close-tab' });
assert.deepEqual(shortcut('TAB', ['control']), { action: 'cycle-tab', direction: 1 });
assert.deepEqual(shortcut('Tab', ['meta', 'shift']), { action: 'cycle-tab', direction: -1 });
assert.deepEqual(shortcut('1', ['control']), { action: 'select-tab', index: 1 });
assert.deepEqual(shortcut('8', ['meta']), { action: 'select-tab', index: 8 });
assert.deepEqual(shortcut('9', ['control']), { action: 'select-tab', index: 9 });
assert.deepEqual(shortcut('L', ['control']), { action: 'focus-address' });
assert.deepEqual(shortcut('F', ['meta']), { action: 'find' });
for (const invalid of [
  { type: 'keyUp', keyCode: 'T', modifiers: ['control'] },
  { type: 'keyDown', keyCode: 'T', modifiers: [] },
  { type: 'keyDown', keyCode: 'T', modifiers: ['control', 'alt'] },
  { type: 'keyDown', keyCode: 'W', modifiers: ['control', 'shift'] },
  { type: 'keyDown', keyCode: '0', modifiers: ['control'] },
  { type: 'keyDown', keyCode: 'F', modifiers: ['control', 'shift'] }
]) {
  assert.equal(getBrowserShortcut(invalid), null, `unexpected shortcut: ${JSON.stringify(invalid)}`);
}

console.log('BROWSER_SHORTCUTS_TEST_PASS: Ctrl/Cmd tab navigation, preserved L/F, and modifier/key filtering verified.');
