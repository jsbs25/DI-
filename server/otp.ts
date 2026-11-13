import crypto from 'node:crypto';

export type OtpPurpose = 'phone_login' | 'email_verify' | 'email_login' | 'password_reset' | 'bind_phone' | 'bind_email';

export interface OtpChallenge {
  id: string;
  purpose: OtpPurpose;
  target: string; // E164 phone or lowercased email
  codeHash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  consumedAt?: number;
  userId?: string; // for binding/reset flows
  meta?: Record<string, string>;
}

const challenges = new Map<string, OtpChallenge>();
const sendLog = new Map<string, number[]>(); // target -> timestamps

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '');
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function hashOtp(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

export function createChallenge(purpose: OtpPurpose, target: string, opts?: { ttlMs?: number; maxAttempts?: number; userId?: string; meta?: Record<string,string> }): { challenge: OtpChallenge; code: string } {
  const ttlMs = opts?.ttlMs ?? 10 * 60 * 1000;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const salt = crypto.randomBytes(16).toString('hex');
  const challenge: OtpChallenge = {
    id: crypto.randomBytes(16).toString('hex'),
    purpose,
    target,
    codeHash: hashOtp(code, salt),
    salt,
    expiresAt: Date.now() + ttlMs,
    attempts: 0,
    maxAttempts: opts?.maxAttempts ?? 5,
    createdAt: Date.now(),
    userId: opts?.userId,
    meta: opts?.meta
  };
  challenges.set(challenge.id, challenge);
  return { challenge, code };
}

export function getChallenge(id: string): OtpChallenge | undefined {
  const c = challenges.get(id);
  if (!c) return undefined;
  if (c.expiresAt <= Date.now() || c.consumedAt) return c;
  return c;
}

export function verifyChallenge(id: string, code: string): { ok: boolean; error?: string; challenge?: OtpChallenge } {
  const c = challenges.get(id);
  if (!c) return { ok: false, error: 'Invalid or expired code session.' };
  if (c.consumedAt) return { ok: false, error: 'Code already used.' };
  if (c.expiresAt <= Date.now()) return { ok: false, error: 'Code expired. Please request a new one.' };
  if (c.attempts >= c.maxAttempts) return { ok: false, error: 'Too many attempts. Please request a new code.' };
  c.attempts += 1;
  const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(code, c.salt), 'hex'), Buffer.from(c.codeHash, 'hex'));
  if (!ok) return { ok: false, error: 'Incorrect verification code.' };
  c.consumedAt = Date.now();
  return { ok: true, challenge: c };
}

export function canSendTo(target: string, windowMs = 60 * 1000, max = 1, hourMax = 5): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const arr = (sendLog.get(target) || []).filter(t => now - t < 60 * 60 * 1000);
  const recent = arr.filter(t => now - t < windowMs);
  if (recent.length >= max) return { ok: false, retryAfterMs: windowMs - (now - Math.min(...recent)) };
  if (arr.length >= hourMax) return { ok: false, retryAfterMs: 60 * 60 * 1000 - (now - Math.min(...arr)) };
  arr.push(now);
  sendLog.set(target, arr);
  return { ok: true };
}

export function cleanupOtps() {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expiresAt < now - 60 * 60 * 1000) challenges.delete(id);
}
setInterval(cleanupOtps, 10 * 60 * 1000).unref?.();
