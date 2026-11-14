// Password hashing compatible with server/store.ts:
// - New/active: scrypt(password, salt, 64) stored as `scrypt$${salt}$${hex}`
// - Legacy: sha256(password + salt) hex
// Uses WebCrypto + scrypt via node:crypto? Workers supports nodejs_compat; fallback to subtle not possible for scrypt.
// We implement scrypt using a pure JS implementation? No - use dynamic import of node:crypto when available.

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const dig = await crypto.subtle.digest('SHA-256', enc);
  return toHex(dig);
}

async function scryptHex(password: string, salt: string, keylen = 64): Promise<string> {
  // nodejs_compat provides node:crypto in Workers runtime
  const mod: any = await import('node:crypto');
  const scryptSync = mod.scryptSync || mod.default?.scryptSync;
  if (scryptSync) {
    const out = scryptSync(password, salt, keylen);
    return toHex(out);
  }
  // fallback: try async
  const scrypt = mod.scrypt || mod.default?.scrypt;
  if (scrypt) {
    const out: Uint8Array = await new Promise((resolve, reject) => scrypt(password, salt, keylen, (err: any, buf: Uint8Array) => err ? reject(err) : resolve(buf)));
    return toHex(out);
  }
  throw new Error('scrypt unavailable in runtime');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scryptHex(password, salt, 64);
  return `scrypt$${salt}$${derived}`;
}

export async function verifyPassword(password: string, acc: { passwordHash: string; salt: string }): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  const ph = acc.passwordHash || '';
  if (ph.startsWith('scrypt$')) {
    const parts = ph.split('$');
    if (parts.length !== 3) return { ok: false, needsUpgrade: false };
    const derived = await scryptHex(password, parts[1], 64);
    return { ok: derived === parts[2], needsUpgrade: false };
  }
  // legacy sha256(password + salt)
  const legacy = await sha256Hex(password + acc.salt);
  return { ok: legacy === ph, needsUpgrade: legacy === ph };
}
