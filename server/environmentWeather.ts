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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache to respect Open-Meteo rate limits

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

async function geocodeCity(city: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') return null;
  const label = [first.name, first.country].filter(Boolean).join(' · ');
  return { lat: first.latitude, lon: first.longitude, label: label || city };
}

export async function fetchRealEnvironmentWeather(params: {
  lat?: number;
  lon?: number;
  city?: string;
}): Promise<LiveWeatherSnapshot> {
  let lat = params.lat;
  let lon = params.lon;
  let locationName = params.city?.trim() || '';

  if ((typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) && locationName) {
    const geo = await geocodeCity(locationName);
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      locationName = geo.label;
    }
  }

  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    // Default anchor coordinates if browser geolocation wasn't shared yet (Beijing)
    lat = 39.9042;
    lon = 116.4074;
    if (!locationName) locationName = '北京 (默认坐标)';
  } else if (!locationName) {
    locationName = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.data,
      locationName: locationName || cached.data.locationName,
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

    const validLat = typeof rawLat === 'number' && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : undefined;
    const validLon = typeof rawLon === 'number' && Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180 ? rawLon : undefined;

    const snapshot = await fetchRealEnvironmentWeather({
      lat: validLat,
      lon: validLon,
      city,
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
