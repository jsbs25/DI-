import type { MediaProbeOutcome } from '../../src/types/media.ts';

interface CacheEntry {
  outcome: MediaProbeOutcome;
  expiresAt: number;
}

const probeCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 500;
const VALID_TTL_MS = 15 * 60 * 1000;
const INVALID_TTL_MS = 3 * 60 * 1000;

function trimCache() {
  if (probeCache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of probeCache) {
    if (v.expiresAt <= now) probeCache.delete(k);
  }
  while (probeCache.size > MAX_CACHE_ENTRIES) {
    const oldest = probeCache.keys().next().value;
    if (!oldest) break;
    probeCache.delete(oldest);
  }
}

function isAudioOrVideoContentType(ct: string, kind: 'audio' | 'video' | 'any'): boolean {
  const lower = ct.toLowerCase().split(';')[0].trim();
  if (!lower) return false;
  if (lower.startsWith('text/html') || lower === 'application/json' || lower === 'application/xml') {
    return false;
  }
  if (kind === 'audio') {
    return (
      lower.startsWith('audio/') ||
      lower === 'application/ogg' ||
      lower === 'application/octet-stream' ||
      lower === 'binary/octet-stream'
    );
  }
  if (kind === 'video') {
    return (
      lower.startsWith('video/') ||
      lower === 'application/vnd.apple.mpegurl' ||
      lower === 'application/x-mpegurl' ||
      lower === 'application/octet-stream'
    );
  }
  return (
    lower.startsWith('audio/') ||
    lower.startsWith('video/') ||
    lower === 'application/ogg' ||
    lower === 'application/octet-stream'
  );
}

export async function probeDirectMediaUrl(
  rawUrl: string,
  expectedKind: 'audio' | 'video' | 'any' = 'any',
  timeoutMs = 5500
): Promise<MediaProbeOutcome> {
  const url = String(rawUrl || '').trim();
  const nowStr = new Date().toISOString();
  if (!/^https?:\/\//i.test(url)) {
    return { url, ok: false, status: 0, reason: 'Invalid URL protocol', checkedAt: nowStr };
  }

  const cacheKey = `${expectedKind}:${url}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.outcome, cached: true };
  }

  let outcome: MediaProbeOutcome = {
    url,
    ok: false,
    status: 0,
    reason: 'Probe failed',
    checkedAt: nowStr,
  };

  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'ONE-Media-Scheduler/1.0',
        Accept: expectedKind === 'audio' ? 'audio/*,*/*;q=0.5' : expectedKind === 'video' ? 'video/*,*/*;q=0.5' : '*/*',
      },
    });

    if (res.status === 405 || res.status === 403 || !res.headers.get('content-type')) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'ONE-Media-Scheduler/1.0',
          Range: 'bytes=0-1023',
        },
      });
      try {
        await res.body?.cancel();
      } catch {}
    }

    const ct = res.headers.get('content-type') || '';
    const okStatus = res.status === 200 || res.status === 206;
    const okType = isAudioOrVideoContentType(ct, expectedKind);

    if (okStatus && okType) {
      outcome = {
        url,
        ok: true,
        status: res.status,
        contentType: ct,
        checkedAt: nowStr,
      };
    } else if (!okStatus) {
      outcome = {
        url,
        ok: false,
        status: res.status,
        contentType: ct,
        reason: `HTTP ${res.status}`,
        checkedAt: nowStr,
      };
    } else {
      outcome = {
        url,
        ok: false,
        status: res.status,
        contentType: ct,
        reason: `Unexpected Content-Type: ${ct || 'unknown'}`,
        checkedAt: nowStr,
      };
    }
  } catch (err: any) {
    outcome = {
      url,
      ok: false,
      status: 0,
      reason: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'Timeout' : (err?.message || 'Network error'),
      checkedAt: nowStr,
    };
  }

  trimCache();
  probeCache.set(cacheKey, {
    outcome,
    expiresAt: Date.now() + (outcome.ok ? VALID_TTL_MS : INVALID_TTL_MS),
  });
  return outcome;
}

export async function probeEmbedUrl(rawUrl: string, timeoutMs = 5000): Promise<MediaProbeOutcome> {
  const url = String(rawUrl || '').trim();
  const nowStr = new Date().toISOString();
  if (!/^https?:\/\//i.test(url)) {
    return { url, ok: false, status: 0, reason: 'Invalid embed URL', checkedAt: nowStr };
  }
  const cacheKey = `embed:${url}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.outcome, cached: true };
  }

  let outcome: MediaProbeOutcome = { url, ok: false, status: 0, checkedAt: nowStr };
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const xfo = (res.headers.get('x-frame-options') || '').toUpperCase();
    const csp = res.headers.get('content-security-policy') || '';
    const frameBlocked = xfo.includes('DENY') || xfo.includes('SAMEORIGIN') || /frame-ancestors\s+'none'/i.test(csp);
    outcome = {
      url,
      ok: res.status >= 200 && res.status < 400 && !frameBlocked,
      status: res.status,
      contentType: res.headers.get('content-type') || undefined,
      reason: frameBlocked ? `Iframe restricted (${xfo || 'CSP'})` : res.ok ? undefined : `HTTP ${res.status}`,
      checkedAt: nowStr,
    };
  } catch (err: any) {
    outcome = {
      url,
      ok: false,
      status: 0,
      reason: err?.message || 'Embed probe failed',
      checkedAt: nowStr,
    };
  }

  trimCache();
  probeCache.set(cacheKey, {
    outcome,
    expiresAt: Date.now() + (outcome.ok ? VALID_TTL_MS : INVALID_TTL_MS),
  });
  return outcome;
}
