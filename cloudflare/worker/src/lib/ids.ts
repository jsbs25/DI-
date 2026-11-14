export function rid(prefix: string) {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`;
}

export function nowIso() { return new Date().toISOString(); }
