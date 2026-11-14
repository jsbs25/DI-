import { qAll, qFirst, exec } from '../lib/db';
import { getSessionToken, SESSION_MAX_AGE_SEC } from '../lib/http';
import { hashPassword, verifyPassword, randomHex } from '../lib/crypto';
import { nowIso, rid } from '../lib/ids';
import { parseJsonMaybe, selfUserView, publicProfileView, hasPassword, getFriendIds, isBlockedEither, getPrivacy } from '../lib/user-shape';
import { normalizePrivacySettings, canSearchByField, DEFAULT_PRIVACY_SETTINGS } from '../lib/privacy';

export type UserRow = Record<string, any>;

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return qFirst<UserRow>(db, 'SELECT * FROM users WHERE id = ?', id);
}

export async function getUserByToken(db: D1Database, token: string): Promise<UserRow | null> {
  const s = await qFirst<{ user_id: string; created_at: string | null; expires_at: string | null }>(db, 'SELECT user_id, created_at, expires_at FROM sessions WHERE token = ?', token);
  if (!s?.user_id) return null;
  const createdMs = s.created_at ? Date.parse(s.created_at) : 0;
  const expiresMs = s.expires_at ? Date.parse(s.expires_at) : (createdMs ? createdMs + SESSION_MAX_AGE_SEC * 1000 : 0);
  if (expiresMs && Date.now() > expiresMs) {
    await exec(db, 'DELETE FROM sessions WHERE token = ?', token).catch(() => {});
    return null;
  }
  return getUserById(db, s.user_id);
}

export async function getSessionUser(db: D1Database, request: Request): Promise<UserRow | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  return getUserByToken(db, token);
}

export async function requireSessionUser(db: D1Database, request: Request): Promise<{ user: UserRow } | { error: Response }> {
  const user = await getSessionUser(db, request);
  if (!user) return { error: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }) };
  const status = user.account_status || parseJsonMaybe<any>(user.extra_json, {})?.accountStatus || 'active';
  if (status === 'suspended' || status === 'deleted') return { error: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }) };
  return { user };
}

export async function getNextEarthSequence(db: D1Database): Promise<number> {
  const row = await qFirst<{ value_json: string }>(db, "SELECT value_json FROM app_state WHERE key='nextEarthSequence'");
  let n = 100001;
  if (row?.value_json) {
    try { const v = JSON.parse(row.value_json); if (Number.isFinite(v)) n = Math.max(100001, Math.floor(v)); } catch {}
  }
  return n;
}
export async function setNextEarthSequence(db: D1Database, n: number) {
  await exec(db, `INSERT OR REPLACE INTO app_state (key, value_json, updated_at) VALUES ('nextEarthSequence', ?, ?)`, JSON.stringify(n), nowIso());
}
export async function allocateEarthId(db: D1Database): Promise<string> {
  // simple read-modify-write; acceptable for low-concurrency local/test, production needs transaction/DO
  const n = await getNextEarthSequence(db);
  const id = `EO-${n}`;
  await setNextEarthSequence(db, n + 1);
  return id;
}

function mapAuthAccount(row: any) {
  if (!row) return null;
  return {
    accountKey: row.account_key ?? row.accountKey,
    userId: row.user_id ?? row.userId,
    email: row.email ?? null,
    passwordHash: row.password_hash ?? row.passwordHash ?? '',
    salt: row.salt ?? '',
    token: row.token ?? null,
    raw: row,
  };
}

export async function findAccountByIdentifier(db: D1Database, identifier: string) {
  const clean = String(identifier || '').trim().toLowerCase();
  // try direct key (email/username/userId keys exist in auth_accounts per store)
  let acc = await qFirst<any>(db, 'SELECT * FROM auth_accounts WHERE account_key = ?', clean);
  if (acc) return mapAuthAccount(acc);
  // fallback by email/username fields
  acc = await qFirst<any>(db, 'SELECT a.* FROM auth_accounts a JOIN users u ON u.id=a.user_id WHERE lower(u.email)=? OR lower(u.username)=? LIMIT 1', clean, clean);
  return mapAuthAccount(acc);
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomHex(32);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000).toISOString();
  await exec(db, 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', token, userId, created, expires);
  await exec(db, 'UPDATE users SET is_online = 1, last_active_at = ? WHERE id = ?', created, userId);
  return token;
}

export async function deleteSession(db: D1Database, token: string) {
  await exec(db, 'DELETE FROM sessions WHERE token = ?', token);
}

export async function addAudit(db: D1Database, ev: { userId?: string | null; event: string; detail?: string | null; ip?: string | null }) {
  await exec(db, 'INSERT INTO security_audit_events (id, user_id, event, detail, ip, created_at, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    rid('aud'), ev.userId || null, ev.event, ev.detail || null, ev.ip || null, nowIso(), JSON.stringify({ type: ev.event, detail: ev.detail || null }));
}

export async function registerUser(db: D1Database, input: { email: string; password: string; displayName?: string; username?: string }) {
  const cleanEmail = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!cleanEmail || !password) throw new Error('Email and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Please provide a valid email address.');

  const existing = await qFirst<any>(db, 'SELECT account_key FROM auth_accounts WHERE account_key = ? OR email = ?', cleanEmail, cleanEmail);
  if (existing) throw new Error('An account with this email already exists.');

  let cleanUsername = String(input.username || cleanEmail.split('@')[0] || `citizen_${Date.now()}`)
    .toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!cleanUsername) cleanUsername = `citizen_${Date.now()}`;
  const taken = await qFirst<any>(db, 'SELECT 1 as x FROM auth_accounts WHERE account_key = ? UNION SELECT 1 as x FROM users WHERE lower(username)=? LIMIT 1', cleanUsername, cleanUsername);
  if (taken) throw new Error('This username is already taken. Please choose another.');

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const earthId = await allocateEarthId(db);
  const displayName = (input.displayName || cleanUsername).trim() || cleanUsername;
  const joinedAt = nowIso();
  const location = { countryCode: 'CN', countryName: 'China', cityName: 'Beijing', lat: 39.9042, lng: 116.4074, isPublic: true };
  const interests = ['Global Dialogue', 'Astronomy', 'Culture'];
  const avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80';
  const banner = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80';

  await exec(db, `INSERT INTO users (
    id, username, display_name, email, email_verified, phone, phone_verified, avatar, banner, bio,
    country_code, country_name, city_name, lat, lng, is_public, interests_json, followers_count, following_count, tips_received,
    is_online, verified, has_completed_onboarding, joined_at, updated_at, linked_identities_json, extra_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId, cleanUsername, displayName, cleanEmail, 0, null, 0, avatar, banner, 'New citizen exploring Earth One.',
    location.countryCode, location.countryName, location.cityName, location.lat, location.lng, 1, JSON.stringify(interests), 1, 1, 0,
    1, 0, 0, joinedAt, joinedAt, JSON.stringify([]), JSON.stringify({ id: userId, earthId, accountStatus: 'active', location, interests })
  );

  const accRow = { userId, email: cleanEmail, passwordHash, salt };
  await exec(db, 'INSERT INTO auth_accounts (account_key, user_id, email, password_hash, salt, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', userId, userId, cleanEmail, passwordHash, salt, joinedAt, joinedAt);
  await exec(db, 'INSERT INTO auth_accounts (account_key, user_id, email, password_hash, salt, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', cleanEmail, userId, cleanEmail, passwordHash, salt, joinedAt, joinedAt);
  await exec(db, 'INSERT INTO auth_accounts (account_key, user_id, email, password_hash, salt, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', cleanUsername, userId, cleanEmail, passwordHash, salt, joinedAt, joinedAt);

  // ensure earthId map/state
  try {
    const mapRow = await qFirst<{ value_json: string }>(db, "SELECT value_json FROM app_state WHERE key='earthIdMap'");
    const map = mapRow?.value_json ? JSON.parse(mapRow.value_json) : {};
    map[userId] = earthId;
    await exec(db, "INSERT OR REPLACE INTO app_state (key,value_json,updated_at) VALUES ('earthIdMap',?,?)", JSON.stringify(map), nowIso());
  } catch {}

  const token = await createSession(db, userId);
  const user = await getUserById(db, userId);
  return { user: await selfUserForRow(db, user!), token };
}

export async function loginUser(db: D1Database, input: { identifier: string; password: string }) {
  const identifier = String(input.identifier || '').trim();
  const password = String(input.password || '');
  if (!identifier || !password) throw new Error('Please enter your email/username and password.');
  const acc = await findAccountByIdentifier(db, identifier);
  if (!acc) throw new Error('Invalid email/username or password.');
  const v = await verifyPassword(password, { passwordHash: acc.passwordHash, salt: acc.salt });
  if (!v.ok) throw new Error('Invalid email/username or password.');
  // upgrade legacy hash for all account keys of this user
  if (v.needsUpgrade) {
    const salt = acc.salt || randomHex(16);
    const newHash = await hashPassword(password, salt);
    await exec(db, 'UPDATE auth_accounts SET password_hash=?, salt=?, updated_at=? WHERE user_id=?', newHash, salt, nowIso(), acc.userId);
  }
  const user = await getUserById(db, acc.userId);
  if (!user) throw new Error('User profile record not found.');
  const status = user.account_status || parseJsonMaybe<any>(user.extra_json, {})?.accountStatus || 'active';
  if (status === 'suspended') throw new Error('Account is suspended.');
  if (status === 'deleted') throw new Error('Account is not available.');
  const token = await createSession(db, user.id);
  return { user: await selfUserForRow(db, user), token };
}

export async function selfUserForRow(db: D1Database, row: UserRow) {
  const hp = await hasPassword(db, row.id);
  return selfUserView(row, { hasPassword: hp });
}

export async function getAuthRuntimeStatus(env: any) {
  const devEnabled = String(env?.DEV_LOGIN_ENABLED || '').toLowerCase() === 'true';
  const devAllowed = devEnabled; // worker-side dev gate simplified; strict local checks are Express-only today
  return {
    env: env?.ENVIRONMENT || 'unknown',
    devQuickLogin: {
      enabled: devEnabled,
      available: devAllowed,
      reason: devAllowed ? null : 'DEV_LOGIN_ENABLED is not enabled for this runtime.',
      demoUser: devAllowed ? { username: 'li_wei', displayName: 'Li Wei (李伟)', id: 'user_cn_1' } : null,
    },
    wechat: { configured: false, appUrlIsPlaceholder: false, message: 'WeChat login not configured in worker runtime yet.' },
    google: { configured: false },
  };
}

export async function searchUsers(db: D1Database, viewerId: string | null, query: string, limit = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  // fetch a bounded candidate set then apply privacy/search rules in app layer (matches store behavior more closely)
  const like = `%${q}%`;
  const rows = await qAll<UserRow>(db, `SELECT * FROM users WHERE lower(id) LIKE ? OR lower(username) LIKE ? OR lower(display_name) LIKE ? LIMIT 200`, like, like, like);
  const out: any[] = [];
  const viewerBlocked = viewerId ? new Set((await qAll<any>(db,'SELECT blocked_id FROM user_blocks WHERE blocker_id=?', viewerId)).map(r=>r.blocked_id)) : new Set<string>();
  for (const u of rows) {
    if (viewerId && u.id === viewerId) continue;
    if (viewerBlocked.has(u.id)) continue;
    if (viewerId) {
      const blockedByThem = await qFirst<any>(db,'SELECT 1 as x FROM user_blocks WHERE blocker_id=? AND blocked_id=?', u.id, viewerId);
      if (blockedByThem) continue;
    }
    const status = u.account_status || parseJsonMaybe<any>(u.extra_json, {})?.accountStatus || 'active';
    if (status === 'deleted') continue;
    const priv = await getPrivacy(db, u.id);
    const earthId = String(parseJsonMaybe<any>(u.extra_json, {})?.earthId || '').toLowerCase();
    const byField = canSearchByField(q, { id: u.id, username: u.username || '', displayName: u.display_name || '' }, priv) || (!!earthId && earthId.includes(q) && (priv.searchableById || priv.searchableByUsername || priv.searchableByDisplayName));
    if (!byField) continue;
    const view = await publicProfileView(db, viewerId, u);
    out.push(view.user || view);
    if (out.length >= Math.min(Math.max(limit,1), 100)) break;
  }
  return out;
}

export async function updateProfile(db: D1Database, userId: string, data: any) {
  const u = await getUserById(db, userId);
  if (!u) throw new Error('User not found');
  const fields: string[] = [];
  const vals: any[] = [];
  const set = (col: string, val: any) => { fields.push(`${col}=?`); vals.push(val); };
  if (typeof data.displayName === 'string') set('display_name', data.displayName.trim());
  if (typeof data.avatar === 'string') set('avatar', data.avatar);
  if (typeof data.banner === 'string') set('banner', data.banner);
  if (typeof data.bio === 'string') set('bio', data.bio.trim());
  if (Array.isArray(data.interests)) set('interests_json', JSON.stringify(data.interests));
  if (data.location && typeof data.location === 'object') {
    const loc = data.location;
    if (loc.countryCode) set('country_code', loc.countryCode);
    if (loc.countryName) set('country_name', loc.countryName);
    if (loc.cityName) set('city_name', loc.cityName);
    if (typeof loc.lat === 'number') set('lat', loc.lat);
    if (typeof loc.lng === 'number') set('lng', loc.lng);
    if (typeof loc.isPublic === 'boolean') set('is_public', loc.isPublic ? 1 : 0);
  }
  if (typeof data.username === 'string' && data.username && data.username !== u.username) {
    const cleanUser = data.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const existing = await qFirst<any>(db, 'SELECT user_id FROM auth_accounts WHERE account_key = ? AND user_id != ?', cleanUser, userId);
    if (existing) throw new Error('Username is already taken.');
    set('username', cleanUser);
    // update username key in auth_accounts best-effort
    const acc = await qFirst<any>(db, 'SELECT * FROM auth_accounts WHERE account_key = ? OR (user_id=? AND account_key=?)', u.username, userId, userId);
    if (u.username) await exec(db, 'DELETE FROM auth_accounts WHERE account_key = ? AND user_id = ?', String(u.username).toLowerCase(), userId);
    if (acc) await exec(db, 'INSERT OR REPLACE INTO auth_accounts (account_key,user_id,email,password_hash,salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', cleanUser, userId, acc.email, acc.password_hash, acc.salt, acc.created_at, nowIso());
  }
  set('updated_at', nowIso());
  if (fields.length) await exec(db, `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...vals, userId);
  const row = await getUserById(db, userId);
  return selfUserForRow(db, row!);
}

export async function completeOnboarding(db: D1Database, userId: string, data: any) {
  await updateProfile(db, userId, data);
  await exec(db, 'UPDATE users SET has_completed_onboarding=1, updated_at=? WHERE id=?', nowIso(), userId);
  const row = await getUserById(db, userId);
  return selfUserForRow(db, row!);
}

export async function toggleLocation(db: D1Database, userId: string) {
  const u = await getUserById(db, userId);
  if (!u) throw new Error('User not found');
  const cur = u.is_public == null ? 1 : (u.is_public ? 1 : 0);
  await exec(db, 'UPDATE users SET is_public=?, updated_at=? WHERE id=?', cur ? 0 : 1, nowIso(), userId);
  const row = await getUserById(db, userId);
  return selfUserForRow(db, row!);
}

export async function getPrivacySettingsRow(db: D1Database, userId: string) {
  const row = await qFirst<{ settings_json: string }>(db, 'SELECT settings_json FROM privacy_settings WHERE user_id=?', userId);
  const norm = normalizePrivacySettings(row ? parseJsonMaybe(row.settings_json, {}) : DEFAULT_PRIVACY_SETTINGS);
  return norm;
}
export async function setPrivacySettingsRow(db: D1Database, userId: string, patch: any) {
  const cur = await getPrivacySettingsRow(db, userId);
  const next = normalizePrivacySettings({ ...cur, ...(patch && typeof patch === 'object' ? patch : {}) });
  await exec(db, 'INSERT OR REPLACE INTO privacy_settings (user_id, settings_json, updated_at) VALUES (?,?,?)', userId, JSON.stringify(next), nowIso());
  return next;
}
