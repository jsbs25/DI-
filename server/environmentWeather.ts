import type express from 'express';

export type ParadiseWeatherKind =
  | 'clear'
  | 'overcast'
  | 'breeze'
  | 'gale'
  | 'light-rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'morning-fog'
  | 'light-mist'
  | 'after-rain'
  | 'rainbow';

export interface LiveWeatherSnapshot {
  success: true;
  source: 'open-meteo';
  locationName: string;
  locationSource: 'gps' | 'ip' | 'timezone' | 'city' | 'default';
  latitude: number;
  longitude: number;
  timezone: string;
  observedAt: string;
  temperatureC: number;
  humidityPct: number;
  windSpeedKmh: number;
  cloudCoverPct: number;
  precipitationMm: number;
  weatherCode: number;
  isDay: boolean;
  mappedWeather: ParadiseWeatherKind;
  conditionZh: string;
  conditionEn: string;
  cached: boolean;
}

interface CacheEntry {
  expiresAt: number;
  data: Omit<LiveWeatherSnapshot, 'cached'>;
}

const WEATHER_CACHE = new Map<string, CacheEntry>();
const REVERSE_GEO_CACHE = new Map<string, { expiresAt: number; label: string }>();
const IP_GEO_CACHE = new Map<string, { expiresAt: number; lat: number; lon: number; label: string }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const GEO_TTL_MS = 60 * 60 * 1000;

const TIMEZONE_CITY_MAP: Record<string, { lat: number; lon: number; zh: string; en: string }> = {
  'Asia/Shanghai': { lat: 31.2304, lon: 121.4737, zh: '中国 · 上海', en: 'Shanghai, China' },
  'Asia/Chongqing': { lat: 29.563, lon: 106.5516, zh: '中国 · 重庆', en: 'Chongqing, China' },
  'Asia/Beijing': { lat: 39.9042, lon: 116.4074, zh: '中国 · 北京', en: 'Beijing, China' },
  'Asia/Urumqi': { lat: 43.8256, lon: 87.6168, zh: '中国 · 乌鲁木齐', en: 'Urumqi, China' },
  'Asia/Hong_Kong': { lat: 22.3193, lon: 114.1694, zh: '中国 · 香港', en: 'Hong Kong' },
  'Asia/Taipei': { lat: 25.033, lon: 121.5654, zh: '中国 · 台北', en: 'Taipei' },
  'Asia/Tokyo': { lat: 35.6762, lon: 139.6503, zh: '日本 · 东京', en: 'Tokyo, Japan' },
  'Asia/Seoul': { lat: 37.5665, lon: 126.978, zh: '韩国 · 首尔', en: 'Seoul, South Korea' },
  'Asia/Singapore': { lat: 1.3521, lon: 103.8198, zh: '新加坡', en: 'Singapore' },
  'Asia/Kuala_Lumpur': { lat: 3.139, lon: 101.6869, zh: '马来西亚 · 吉隆坡', en: 'Kuala Lumpur' },
  'Asia/Jakarta': { lat: -6.2088, lon: 106.8456, zh: '印尼 · 雅加达', en: 'Jakarta' },
  'Asia/Dubai': { lat: 25.2048, lon: 55.2708, zh: '阿联酋 · 迪拜', en: 'Dubai, UAE' },
  'Asia/Riyadh': { lat: 24.7136, lon: 46.6753, zh: '沙特 · 利雅得', en: 'Riyadh, Saudi Arabia' },
  'Asia/Amman': { lat: 31.9539, lon: 35.9106, zh: '约旦 · 安曼', en: 'Amman, Jordan' },
  'Asia/Qatar': { lat: 25.2854, lon: 51.531, zh: '卡塔尔 · 多哈', en: 'Doha, Qatar' },
  'Asia/Kuwait': { lat: 29.3759, lon: 47.9774, zh: '科威特城', en: 'Kuwait City' },
  'Africa/Cairo': { lat: 30.0444, lon: 31.2357, zh: '埃及 · 开罗', en: 'Cairo, Egypt' },
  'Europe/Istanbul': { lat: 41.0082, lon: 28.9784, zh: '土耳其 · 伊斯坦布尔', en: 'Istanbul, Turkey' },
  'Europe/London': { lat: 51.5072, lon: -0.1276, zh: '英国 · 伦敦', en: 'London, UK' },
  'Europe/Paris': { lat: 48.8566, lon: 2.3522, zh: '法国 · 巴黎', en: 'Paris, France' },
  'Europe/Berlin': { lat: 52.52, lon: 13.405, zh: '德国 · 柏林', en: 'Berlin, Germany' },
  'Europe/Moscow': { lat: 55.7558, lon: 37.6173, zh: '俄罗斯 · 莫斯科', en: 'Moscow, Russia' },
  'America/New_York': { lat: 40.7128, lon: -74.006, zh: '美国 · 纽约', en: 'New York, USA' },
  'America/Chicago': { lat: 41.8781, lon: -87.6298, zh: '美国 · 芝加哥', en: 'Chicago, USA' },
  'America/Los_Angeles': { lat: 34.0522, lon: -118.2437, zh: '美国 · 洛杉矶', en: 'Los Angeles, USA' },
  'America/Toronto': { lat: 43.6532, lon: -79.3832, zh: '加拿大 · 多伦多', en: 'Toronto, Canada' },
  'Australia/Sydney': { lat: -33.8688, lon: 151.2093, zh: '澳大利亚 · 悉尼', en: 'Sydney, Australia' },
};

function mapWmoToParadiseWeather(input: {
  code: number;
  windKmh: number;
  cloudPct: number;
  precipMm: number;
  isDay: boolean;
}): { kind: ParadiseWeatherKind; zh: string; en: string } {
  const { code, windKmh, cloudPct, precipMm, isDay } = input;

  if (code === 95 || code === 96 || code === 99) {
    return { kind: 'thunderstorm', zh: '雷暴天气', en: 'Thunderstorm' };
  }
  if (code === 65 || code === 67 || code === 82 || precipMm >= 6.0) {
    return { kind: 'heavy-rain', zh: '大雨', en: 'Heavy Rain' };
  }
  if (
    (code >= 51 && code <= 64) ||
    code === 66 ||
    code === 80 ||
    code === 81 ||
    (code >= 71 && code <= 77) ||
    code === 85 ||
    code === 86 ||
    precipMm > 0.1
  ) {
    return {
      kind: 'light-rain',
      zh: code >= 71 ? '雨雪微寒' : '细雨',
      en: code >= 71 ? 'Wintry Precipitation' : 'Light Rain',
    };
  }
  if (code === 45 || code === 48) {
    return isDay
      ? { kind: 'light-mist', zh: '轻雾', en: 'Light Mist' }
      : { kind: 'morning-fog', zh: '薄雾笼罩', en: 'Mist & Fog' };
  }
  if (windKmh >= 38) {
    return { kind: 'gale', zh: '大风', en: 'Strong Wind' };
  }
  if (code === 3 || cloudPct >= 82) {
    return { kind: 'overcast', zh: '阴天', en: 'Overcast' };
  }
  if (windKmh >= 16) {
    return { kind: 'breeze', zh: '微风多云', en: 'Breeze' };
  }
  if (code === 1 || code === 2 || cloudPct >= 45) {
    return { kind: 'breeze', zh: '晴朗微风', en: 'Partly Cloudy' };
  }
  return { kind: 'clear', zh: '晴空万里', en: 'Clear Sky' };
}

async function geocodeCity(city: string, lang = 'zh'): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${encodeURIComponent(lang)}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') return null;
  const label = [first.name, first.admin1 && first.admin1 !== first.name ? first.admin1 : '', first.country]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
  return { lat: first.latitude, lon: first.longitude, label: label || city };
}

/**
 * Standard Reverse Geocoding for GPS coordinates (BigDataCloud + OpenStreetMap Nominatim fallback).
 * Always converts lat/lon into a clean human-readable standard city/district name.
 */
async function reverseGeocodeCoords(lat: number, lon: number, lang = 'zh'): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}:${lang}`;
  const cached = REVERSE_GEO_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.label;

  // 1) BigDataCloud standard reverse geocode client API (fast, free, multilingual)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&localityLanguage=${encodeURIComponent(lang)}`;
    const res = await fetch(bdcUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const d: any = await res.json();
      const city = String(d?.city || d?.principalSubdivision || '').trim();
      const locality = String(d?.locality || '').trim();
      const country = String(d?.countryName || '').trim();
      const parts: string[] = [];
      if (city) parts.push(city);
      if (locality && locality !== city && !city.includes(locality)) parts.push(locality);
      if (parts.length === 0 && country) parts.push(country);
      const label = parts.slice(0, 2).join(' · ');
      if (label) {
        REVERSE_GEO_CACHE.set(key, { expiresAt: Date.now() + GEO_TTL_MS, label });
        return label;
      }
    }
  } catch {
    // fall through to Nominatim
  }

  // 2) OpenStreetMap Nominatim reverse geocode fallback
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=12&accept-language=${encodeURIComponent(lang)}`;
    const res = await fetch(nomUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EarthOne-Weather/1.0 (+https://earthone.world)',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d: any = await res.json();
      const addr = d?.address || {};
      const primary = String(addr.city || addr.town || addr.municipality || addr.state || '').trim();
      const district = String(addr.suburb || addr.city_district || addr.county || addr.district || '').trim();
      const parts = [primary, district && district !== primary ? district : ''].filter(Boolean);
      const label = parts.slice(0, 2).join(' · ') || String(d?.name || '').trim();
      if (label) {
        REVERSE_GEO_CACHE.set(key, { expiresAt: Date.now() + GEO_TTL_MS, label });
        return label;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function extractClientIp(req: express.Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : typeof fwd === 'string' ? fwd.split(',')[0] : req.socket.remoteAddress || '';
  const ip = raw.trim().replace(/^::ffff:/, '');
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return null;
  }
  return ip;
}

async function detectLocationByIp(ip: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const cached = IP_GEO_CACHE.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return { lat: cached.lat, lon: cached.lon, label: cached.label };
  }
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2800),
    });
    if (res.ok) {
      const d: any = await res.json();
      if (d?.success !== false && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
        const label = [d.city || d.region, d.country].filter(Boolean).slice(0, 2).join(' · ') || 'Local';
        const hit = { lat: d.latitude, lon: d.longitude, label };
        IP_GEO_CACHE.set(ip, { expiresAt: Date.now() + GEO_TTL_MS, ...hit });
        return hit;
      }
    }
  } catch {
    // fall through to secondary IP geo provider
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,lat,lon&lang=zh-CN`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (res.ok) {
      const d: any = await res.json();
      if (d?.status === 'success' && typeof d?.lat === 'number' && typeof d?.lon === 'number') {
        const label = [d.city || d.regionName, d.country].filter(Boolean).slice(0, 2).join(' · ') || 'Local';
        const hit = { lat: d.lat, lon: d.lon, label };
        IP_GEO_CACHE.set(ip, { expiresAt: Date.now() + GEO_TTL_MS, ...hit });
        return hit;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchRealEnvironmentWeather(params: {
  lat?: number;
  lon?: number;
  city?: string;
  tz?: string;
  lang?: string;
  clientIp?: string | null;
}): Promise<LiveWeatherSnapshot> {
  const lang = params.lang === 'en' || params.lang === 'ar' ? params.lang : 'zh';
  let lat = params.lat;
  let lon = params.lon;
  let locationName = params.city?.trim() || '';
  let locationSource: LiveWeatherSnapshot['locationSource'] = 'default';

  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    locationSource = 'gps';
    if (!locationName) {
      const resolved = await reverseGeocodeCoords(lat, lon, lang);
      locationName = resolved || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    }
  } else if (locationName) {
    const geo = await geocodeCity(locationName, lang);
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      locationName = geo.label;
      locationSource = 'city';
    }
  }

  // Fallback 1: Standard client IP geolocation
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (params.clientIp) {
      const ipLoc = await detectLocationByIp(params.clientIp);
      if (ipLoc) {
        lat = ipLoc.lat;
        lon = ipLoc.lon;
        locationName = ipLoc.label;
        locationSource = 'ip';
      }
    }
  }

  // Fallback 2: Browser IANA timezone standard city anchor (e.g. Asia/Shanghai, Asia/Riyadh, America/Los_Angeles)
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    const tzKey = (params.tz || '').trim();
    const tzHit = TIMEZONE_CITY_MAP[tzKey];
    if (tzHit) {
      lat = tzHit.lat;
      lon = tzHit.lon;
      locationName = lang === 'zh' ? tzHit.zh : tzHit.en;
      locationSource = 'timezone';
    } else if (tzKey.includes('/')) {
      const cityGuess = tzKey.split('/').pop()!.replace(/_/g, ' ');
      const geo = await geocodeCity(cityGuess, lang).catch(() => null);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        locationName = geo.label;
        locationSource = 'timezone';
      }
    }
  }

  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    lat = 39.9042;
    lon = 116.4074;
    if (!locationName) locationName = lang === 'zh' ? '中国 · 北京' : 'Beijing, China';
    locationSource = 'default';
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.data,
      locationName: locationName || cached.data.locationName,
      locationSource,
      cached: true,
    };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover,precipitation,is_day` +
    `&timezone=auto`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const cur = json?.current;
  if (!cur) {
    throw new Error('Open-Meteo returned empty current weather payload');
  }

  const weatherCode = Number(cur.weather_code ?? 0);
  const windSpeedKmh = Number(cur.wind_speed_10m ?? 0);
  const cloudCoverPct = Number(cur.cloud_cover ?? 0);
  const precipitationMm = Number(cur.precipitation ?? 0);
  const isDay = Number(cur.is_day ?? 1) === 1;

  const mapped = mapWmoToParadiseWeather({
    code: weatherCode,
    windKmh: windSpeedKmh,
    cloudPct: cloudCoverPct,
    precipMm: precipitationMm,
    isDay,
  });

  const payload: Omit<LiveWeatherSnapshot, 'cached'> = {
    success: true,
    source: 'open-meteo',
    locationName,
    locationSource,
    latitude: Number(json.latitude ?? lat),
    longitude: Number(json.longitude ?? lon),
    timezone: String(json.timezone || 'UTC'),
    observedAt: String(cur.time || new Date().toISOString()),
    temperatureC: Number(cur.temperature_2m ?? 0),
    humidityPct: Number(cur.relative_humidity_2m ?? 0),
    windSpeedKmh,
    cloudCoverPct,
    precipitationMm,
    weatherCode,
    isDay,
    mappedWeather: mapped.kind,
    conditionZh: mapped.zh,
    conditionEn: mapped.en,
  };

  WEATHER_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: payload,
  });

  return { ...payload, cached: false };
}

export async function handleEnvironmentWeatherRoute(req: express.Request, res: express.Response) {
  try {
    const rawLat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
    const rawLon = req.query.lon !== undefined ? Number(req.query.lon) : undefined;
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : undefined;
    const tz = typeof req.query.tz === 'string' ? req.query.tz.trim() : undefined;
    const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : 'zh';

    const validLat = typeof rawLat === 'number' && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : undefined;
    const validLon = typeof rawLon === 'number' && Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180 ? rawLon : undefined;

    const snapshot = await fetchRealEnvironmentWeather({
      lat: validLat,
      lon: validLon,
      city,
      tz,
      lang,
      clientIp: extractClientIp(req),
    });
    return res.json(snapshot);
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      unavailable: true,
      error: err?.message || 'Real-time weather upstream unreachable',
    });
  }
}
