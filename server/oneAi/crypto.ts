import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.EARTH_ONE_DATA_DIR || path.join(process.cwd(), 'server_data'));
const MASTER_KEY_FILE = path.join(DATA_DIR, '.one_ai_master_key');

let cachedMasterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const envKey = (process.env.ONE_AI_ENCRYPTION_KEY || '').trim();
  if (envKey) {
    cachedMasterKey = crypto.createHash('sha256').update(envKey, 'utf8').digest();
    return cachedMasterKey;
  }

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(MASTER_KEY_FILE)) {
      const hex = fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim();
      if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        cachedMasterKey = Buffer.from(hex, 'hex');
        return cachedMasterKey;
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(MASTER_KEY_FILE, generated.toString('hex'), { mode: 0o600 });
    cachedMasterKey = generated;
    return cachedMasterKey;
  } catch {
    // Ephemeral fallback if filesystem is read-only
    cachedMasterKey = crypto.createHash('sha256').update(process.cwd() + ':one_ai_ephemeral').digest();
    return cachedMasterKey;
  }
}

export function encryptSecret(plainText: string): string {
  const clean = (plainText || '').trim();
  if (!clean) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherText: string): string {
  const raw = (cipherText || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('v1:')) return '';
  const parts = raw.split(':');
  if (parts.length !== 4) return '';
  try {
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
}

export function maskApiKey(rawKey: string | undefined | null): string {
  const key = (rawKey || '').trim();
  if (!key) return '未配置';
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
];

export function validateExternalAiBaseUrl(
  rawUrl: string,
  options: { allowLoopback?: boolean } = {}
): { ok: true; normalized: string } | { ok: false; error: string } {
  const cleaned = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!cleaned) return { ok: false, error: 'Base URL cannot be empty.' };

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:' && !(options.allowLoopback && parsed.protocol === 'http:')) {
    return { ok: false, error: 'External AI providers must use https:// protocol.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Credentials embedded in URL are forbidden.' };
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLoopback) {
    if (!options.allowLoopback) {
      return { ok: false, error: 'Loopback endpoints are blocked unless explicitly allow-listed.' };
    }
    return { ok: true, normalized: cleaned };
  }

  if (host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    return { ok: false, error: 'Internal hostnames are blocked (SSRF protection).' };
  }

  if (PRIVATE_IP_PATTERNS.some((rx) => rx.test(host))) {
    return { ok: false, error: 'Private/link-local IP addresses are blocked (SSRF protection).' };
  }

  return { ok: true, normalized: cleaned };
}
