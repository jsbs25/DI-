export interface CityGeo {
  name: string;
  lat: number;
  lng: number;
}

export interface CountryGeo {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  lat: number;
  lng: number;
  cities: CityGeo[];
}

export const WORLD_COUNTRIES: CountryGeo[] = [
  {
    code: 'CN',
    name: 'China',
    nativeName: '中国',
    flag: '🇨🇳',
    lat: 35.8617,
    lng: 104.1954,
    cities: [
      { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
      { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
      { name: 'Shenzhen', lat: 22.5431, lng: 114.0579 },
      { name: 'Guangzhou', lat: 23.1291, lng: 113.2644 },
      { name: 'Chengdu', lat: 30.5728, lng: 104.0668 },
      { name: 'Hangzhou', lat: 30.2741, lng: 120.1551 },
      { name: "Xi'an", lat: 34.3416, lng: 108.9398 }
    ]
  },
  {
    code: 'US',
    name: 'United States',
    nativeName: 'United States',
    flag: '🇺🇸',
    lat: 37.0902,
    lng: -95.7129,
    cities: [
      { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
      { name: 'New York', lat: 40.7128, lng: -74.0060 },
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
      { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
      { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
      { name: 'Austin', lat: 30.2672, lng: -97.7431 },
      { name: 'Boston', lat: 42.3601, lng: -71.0589 }
    ]
  },
  {
    code: 'JO',
    name: 'Jordan',
    nativeName: 'الأردن',
    flag: '🇯🇴',
    lat: 30.5852,
    lng: 36.2384,
    cities: [
      { name: 'Amman', lat: 31.9454, lng: 35.9284 },
      { name: 'Zarqa', lat: 32.0728, lng: 36.0880 },
      { name: 'Irbid', lat: 32.5568, lng: 35.8469 },
      { name: 'Aqaba', lat: 29.5321, lng: 35.0063 },
      { name: 'Petra / Wadi Musa', lat: 30.3285, lng: 35.4444 }
    ]
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    nativeName: 'المملكة العربية السعودية',
    flag: '🇸🇦',
    lat: 23.8859,
    lng: 45.0792,
    cities: [
      { name: 'Riyadh', lat: 24.7136, lng: 46.6753 },
      { name: 'Jeddah', lat: 21.4858, lng: 39.1925 },
      { name: 'Mecca', lat: 21.3891, lng: 39.8579 },
      { name: 'Medina', lat: 24.5247, lng: 39.5692 },
      { name: 'Dammam', lat: 26.4207, lng: 50.0888 },
      { name: 'Al-Ula', lat: 26.6186, lng: 37.9229 }
    ]
  },
  {
    code: 'FR',
    name: 'France',
    nativeName: 'France',
    flag: '🇫🇷',
    lat: 46.2276,
    lng: 2.2137,
    cities: [
      { name: 'Paris', lat: 48.8566, lng: 2.3522 },
      { name: 'Marseille', lat: 43.2965, lng: 5.3698 },
      { name: 'Lyon', lat: 45.7640, lng: 4.8357 },
      { name: 'Toulouse', lat: 43.6047, lng: 1.4442 },
      { name: 'Nice', lat: 43.7102, lng: 7.2620 }
    ]
  },
  {
    code: 'ES',
    name: 'Spain',
    nativeName: 'España',
    flag: '🇪🇸',
    lat: 40.4637,
    lng: -3.7492,
    cities: [
      { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
      { name: 'Barcelona', lat: 41.3879, lng: 2.1699 },
      { name: 'Valencia', lat: 39.4699, lng: -0.3763 },
      { name: 'Seville', lat: 37.3891, lng: -5.9845 },
      { name: 'Granada', lat: 37.1773, lng: -3.5986 }
    ]
  },
  {
    code: 'RU',
    name: 'Russia',
    nativeName: 'Россия',
    flag: '🇷🇺',
    lat: 61.5240,
    lng: 105.3188,
    cities: [
      { name: 'Moscow', lat: 55.7558, lng: 37.6173 },
      { name: 'Saint Petersburg', lat: 59.9343, lng: 30.3351 },
      { name: 'Novosibirsk', lat: 55.0084, lng: 82.9357 },
      { name: 'Kazan', lat: 55.8304, lng: 49.0661 },
      { name: 'Vladivostok', lat: 43.1155, lng: 131.8855 }
    ]
  },
  {
    code: 'JP',
    name: 'Japan',
    nativeName: '日本',
    flag: '🇯🇵',
    lat: 36.2048,
    lng: 138.2529,
    cities: [
      { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
      { name: 'Kyoto', lat: 35.0116, lng: 135.7681 },
      { name: 'Osaka', lat: 34.6937, lng: 135.5023 },
      { name: 'Sapporo', lat: 43.0618, lng: 141.3545 },
      { name: 'Fukuoka', lat: 33.5904, lng: 130.4017 }
    ]
  },
  {
    code: 'BR',
    name: 'Brazil',
    nativeName: 'Brasil',
    flag: '🇧🇷',
    lat: -14.2350,
    lng: -51.9253,
    cities: [
      { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
      { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
      { name: 'Brasília', lat: -15.7975, lng: -47.8919 },
      { name: 'Salvador', lat: -12.9777, lng: -38.5016 }
    ]
  },
  {
    code: 'EG',
    name: 'Egypt',
    nativeName: 'مصر',
    flag: '🇪🇬',
    lat: 26.8206,
    lng: 30.8025,
    cities: [
      { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
      { name: 'Alexandria', lat: 31.2001, lng: 29.9187 },
      { name: 'Giza', lat: 30.0131, lng: 31.2089 },
      { name: 'Luxor', lat: 25.6872, lng: 32.6396 }
    ]
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    nativeName: 'United Kingdom',
    flag: '🇬🇧',
    lat: 55.3781,
    lng: -3.4360,
    cities: [
      { name: 'London', lat: 51.5074, lng: -0.1278 },
      { name: 'Edinburgh', lat: 55.9533, lng: -3.1883 },
      { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
      { name: 'Oxford', lat: 51.7520, lng: -1.2577 }
    ]
  },
  {
    code: 'DE',
    name: 'Germany',
    nativeName: 'Deutschland',
    flag: '🇩🇪',
    lat: 51.1657,
    lng: 10.4515,
    cities: [
      { name: 'Berlin', lat: 52.5200, lng: 13.4050 },
      { name: 'Munich', lat: 48.1351, lng: 11.5820 },
      { name: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
      { name: 'Hamburg', lat: 53.5511, lng: 9.9937 }
    ]
  }
];

export const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80'
];

export function resolveCoordinates(countryCode: string, cityName: string): { lat: number; lng: number } {
  const country = WORLD_COUNTRIES.find(c => c.code.toUpperCase() === countryCode.toUpperCase());
  if (!country) {
    return { lat: 31.2304, lng: 121.4737 }; // default
  }
  const city = country.cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  if (city) {
    return { lat: city.lat, lng: city.lng };
  }
  // Fall back to country central coordinates
  return { lat: country.lat, lng: country.lng };
}
