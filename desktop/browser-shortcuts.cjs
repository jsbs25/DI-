'use strict';

function getBrowserShortcut(input) {
  if (!input || input.type !== 'keyDown') return null;
  const modifiers = Array.isArray(input.modifiers) ? input.modifiers : [];
  const hasControl = Boolean(input.control || modifiers.includes('control'));
  const hasMeta = Boolean(input.meta || modifiers.includes('meta'));
  const hasAlt = Boolean(input.alt || modifiers.includes('alt'));
  const hasShift = Boolean(input.shift || modifiers.includes('shift'));
  if (!(hasControl || hasMeta) || hasAlt) return null;

  const keys = [input.key, input.keyCode].filter(value => value !== undefined && value !== null)
    .map(value => String(value).toLowerCase());
  const key = keys[0] || '';
  if (key === 'tab') return { action: 'cycle-tab', direction: hasShift ? -1 : 1 };
  if (keys.some(value => ['+', 'plus', 'add'].includes(value) || (hasShift && ['=', 'equal'].includes(value)))) {
    return { action: 'zoom', direction: 'in' };
  }
  if (keys.some(value => ['-', 'minus', 'subtract'].includes(value))) return { action: 'zoom', direction: 'out' };
  if (!hasShift && keys.some(value => ['0', 'numpad0', 'num0', 'kp_0'].includes(value))) {
    return { action: 'zoom', direction: 'reset' };
  }
  if (hasShift && key === 't') return { action: 'restore-closed-tab' };
  if (hasShift) return null;
  if (key === 't') return { action: 'new-tab' };
  if (key === 'w') return { action: 'close-tab' };
  if (key === 'l') return { action: 'focus-address' };
  if (key === 'f') return { action: 'find' };
  if (/^[1-9]$/.test(key)) return { action: 'select-tab', index: Number(key) };
  return null;
}

module.exports = { getBrowserShortcut };
