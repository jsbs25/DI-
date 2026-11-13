/**
 * EARTH ONE - UNIVERSE ENGINE
 * Celestial Bodies Database & Astrophysical Constants
 * 
 * Accurately models the Sun, 8 canonical Solar System planets, and Earth's Moon.
 * Provides both physical constants (NASA planetary fact sheets) and normalized
 * rendering coordinates for the interactive 3D universe viewport.
 */

export type CelestialType = 'star' | 'terrestrial_planet' | 'gas_giant' | 'ice_giant' | 'moon';

export interface RingSystemConfig {
  innerRadiusRatio: number; // Relative to planet visual radius
  outerRadiusRatio: number;
  textureType: 'saturn_cassini' | 'uranus_thin';
  tiltDegrees: number;
}

export interface AtmosphereLayer {
  hasAtmosphere: boolean;
  colorHex: string;
  density: number;
  composition: { gas: string; percentage: number }[];
}

export interface SpaceMission {
  name: string;
  agency: string;
  year: string;
  achievement: string;
}

export interface CelestialBody {
  id: string;
  name: string;
  chineseName: string;
  tagline: string;
  type: CelestialType;
  
  // Real Physical Constants (NASA Astronomical Units)
  physical: {
    meanRadiusKm: number;
    massKg: string;
    surfaceGravityMps2: number;
    surfaceTempKelvin: { min: number; mean: number; max: number };
    meanOrbitRadiusAU: number;
    orbitalPeriodEarthDays: number;
    rotationPeriodHours: number;
    axialTiltDegrees: number;
    moonsKnownCount: number;
  };

  // Rendering & Engine Scaled Parameters
  visual: {
    displayRadius: number; // Scaled for aesthetic viewing in viewport
    orbitDistance: number; // Scaled logarithmic distance from Sun
    baseColor: string;
    emissive?: boolean;
    hasClouds?: boolean;
    rings?: RingSystemConfig;
    atmosphere?: AtmosphereLayer;
  };

  // Human Civilization & Earth One Ecosystem Role
  humanityRole: {
    status: 'habitable_homeworld' | 'human_outpost_planned' | 'robotic_reconnaissance' | 'scientific_observatory';
    description: string;
    notableMissions: SpaceMission[];
  };
}

export const CELESTIAL_BODIES: CelestialBody[] = [
  {
    id: 'sun',
    name: 'Sun',
    chineseName: '太阳',
    tagline: 'The Gravitational & Energetic Heart of the Solar System',
    type: 'star',
    physical: {
      meanRadiusKm: 696340,
      massKg: '1.989 × 10³⁰',
      surfaceGravityMps2: 274.0,
      surfaceTempKelvin: { min: 5778, mean: 5778, max: 15700000 },
      meanOrbitRadiusAU: 0,
      orbitalPeriodEarthDays: 0,
      rotationPeriodHours: 609.12, // ~25.38 Earth days at equator
      axialTiltDegrees: 7.25,
      moonsKnownCount: 0
    },
    visual: {
      displayRadius: 9.0,
      orbitDistance: 0,
      baseColor: '#FFF275',
      emissive: true
    },
    humanityRole: {
      status: 'scientific_observatory',
      description: 'Provides 99.86% of the solar system mass and fuels all photosynthesis and biosphere activity on Earth One.',
      notableMissions: [
        { name: 'Parker Solar Probe', agency: 'NASA', year: '2018', achievement: 'First human spacecraft to fly directly through the solar corona' },
        { name: 'SOHO', agency: 'ESA/NASA', year: '1995', achievement: 'Continuous real-time solar flare and CME monitoring' }
      ]
    }
  },
  {
    id: 'mercury',
    name: 'Mercury',
    chineseName: '水星',
    tagline: 'Sun-Scorched Prime Sentinel',
    type: 'terrestrial_planet',
    physical: {
      meanRadiusKm: 2439.7,
      massKg: '3.301 × 10²³',
      surfaceGravityMps2: 3.7,
      surfaceTempKelvin: { min: 100, mean: 440, max: 700 },
      meanOrbitRadiusAU: 0.387,
      orbitalPeriodEarthDays: 87.97,
      rotationPeriodHours: 1407.6, // 58.6 Earth days
      axialTiltDegrees: 0.034,
      moonsKnownCount: 0
    },
    visual: {
      displayRadius: 1.4,
      orbitDistance: 16,
      baseColor: '#A49E9E',
      atmosphere: {
        hasAtmosphere: false,
        colorHex: '#ffffff',
        density: 0,
        composition: [{ gas: 'Oxygen', percentage: 42 }, { gas: 'Sodium', percentage: 29 }, { gas: 'Hydrogen', percentage: 22 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'Extremely dense iron core; experiences extreme 600K diurnal swings.',
      notableMissions: [
        { name: 'MESSENGER', agency: 'NASA', year: '2011-2015', achievement: 'First orbital survey uncovering volatile water ice in polar shadow craters' },
        { name: 'BepiColombo', agency: 'ESA/JAXA', year: '2018', achievement: 'Dual-probe mission mapping magnetosphere and exosphere dynamics' }
      ]
    }
  },
  {
    id: 'venus',
    name: 'Venus',
    chineseName: '金星',
    tagline: 'Superheated Shrouded Twin',
    type: 'terrestrial_planet',
    physical: {
      meanRadiusKm: 6051.8,
      massKg: '4.867 × 10²⁴',
      surfaceGravityMps2: 8.87,
      surfaceTempKelvin: { min: 737, mean: 737, max: 737 },
      meanOrbitRadiusAU: 0.723,
      orbitalPeriodEarthDays: 224.7,
      rotationPeriodHours: -5832.5, // Retrograde rotation
      axialTiltDegrees: 177.36,
      moonsKnownCount: 0
    },
    visual: {
      displayRadius: 2.8,
      orbitDistance: 24,
      baseColor: '#E3BB7B',
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#E0A868',
        density: 0.85,
        composition: [{ gas: 'Carbon Dioxide (CO₂)', percentage: 96.5 }, { gas: 'Nitrogen (N₂)', percentage: 3.5 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'Runaway greenhouse atmosphere with 92 bar surface pressure and sulfuric acid clouds.',
      notableMissions: [
        { name: 'Venera 13', agency: 'USSR', year: '1981', achievement: 'Returned the first color photographic panoramas from the Venusian surface' },
        { name: 'DAVINCI & VERITAS', agency: 'NASA', year: 'Planned 2029+', achievement: 'Next-generation atmospheric descent probe and synthetic aperture radar mapping' }
      ]
    }
  },
  {
    id: 'earth',
    name: 'Earth',
    chineseName: '地球',
    tagline: 'Earth One — Cradle of Humanity and Global Digital Twin',
    type: 'terrestrial_planet',
    physical: {
      meanRadiusKm: 6371.0,
      massKg: '5.972 × 10²⁴',
      surfaceGravityMps2: 9.807,
      surfaceTempKelvin: { min: 184, mean: 288, max: 330 },
      meanOrbitRadiusAU: 1.0,
      orbitalPeriodEarthDays: 365.256,
      rotationPeriodHours: 23.934,
      axialTiltDegrees: 23.44,
      moonsKnownCount: 1
    },
    visual: {
      displayRadius: 3.2,
      orbitDistance: 34,
      baseColor: '#2B82C9',
      hasClouds: true,
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#4DA6FF',
        density: 0.65,
        composition: [{ gas: 'Nitrogen (N₂)', percentage: 78.08 }, { gas: 'Oxygen (O₂)', percentage: 20.95 }, { gas: 'Argon (Ar)', percentage: 0.93 }]
      }
    },
    humanityRole: {
      status: 'habitable_homeworld',
      description: 'The sole known sanctuary of life in the cosmos. Home to 8 billion human souls interconnected on EARTH ONE.',
      notableMissions: [
        { name: 'Apollo 8 / Earthrise', agency: 'NASA', year: '1968', achievement: 'First human vantage of Earth emerging over lunar horizon' },
        { name: 'Earth One Digital Twin', agency: 'EARTH ONE Consortium', year: '2025', achievement: 'Real-time geographic spatial graph linking human citizens and planetary telemetry' }
      ]
    }
  },
  {
    id: 'moon',
    name: 'Moon',
    chineseName: '月球',
    tagline: 'Silent Silver Satellite & Gateway to Deep Space',
    type: 'moon',
    physical: {
      meanRadiusKm: 1737.4,
      massKg: '7.342 × 10²²',
      surfaceGravityMps2: 1.62,
      surfaceTempKelvin: { min: 100, mean: 220, max: 390 },
      meanOrbitRadiusAU: 0.00257, // ~384,400 km
      orbitalPeriodEarthDays: 27.32,
      rotationPeriodHours: 655.7, // Tidally locked
      axialTiltDegrees: 1.54,
      moonsKnownCount: 0
    },
    visual: {
      displayRadius: 0.9,
      orbitDistance: 39,
      baseColor: '#B0B0B0'
    },
    humanityRole: {
      status: 'human_outpost_planned',
      description: 'Stabilizes Earth axial precession and drives oceanic tidal rhythm. Target of humanity’s permanent Artemis base camp.',
      notableMissions: [
        { name: 'Apollo 11', agency: 'NASA', year: '1969', achievement: 'First human lunar landing: Neil Armstrong & Buzz Aldrin' },
        { name: 'Chang’e 5 & 6', agency: 'CNSA', year: '2020-2024', achievement: 'First robotic sample return from the lunar farside' }
      ]
    }
  },
  {
    id: 'mars',
    name: 'Mars',
    chineseName: '火星',
    tagline: 'The Rust-Hued Frontier of Multiplanetary Civilization',
    type: 'terrestrial_planet',
    physical: {
      meanRadiusKm: 3389.5,
      massKg: '6.417 × 10²³',
      surfaceGravityMps2: 3.72,
      surfaceTempKelvin: { min: 130, mean: 210, max: 293 },
      meanOrbitRadiusAU: 1.524,
      orbitalPeriodEarthDays: 686.98,
      rotationPeriodHours: 24.623,
      axialTiltDegrees: 25.19,
      moonsKnownCount: 2
    },
    visual: {
      displayRadius: 2.1,
      orbitDistance: 46,
      baseColor: '#C45129',
      hasClouds: false,
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#C97A52',
        density: 0.25,
        composition: [{ gas: 'Carbon Dioxide (CO₂)', percentage: 95.3 }, { gas: 'Nitrogen (N₂)', percentage: 2.6 }]
      }
    },
    humanityRole: {
      status: 'human_outpost_planned',
      description: 'Hosts the solar system’s largest shield volcano (Olympus Mons) and canyon system (Valles Marineris). Primary destination for human expansion.',
      notableMissions: [
        { name: 'Perseverance & Ingenuity', agency: 'NASA', year: '2021', achievement: 'First powered atmospheric helicopter flight on another world & astrobiological core sampling' },
        { name: 'Tianwen-1 / Zhurong', agency: 'CNSA', year: '2021', achievement: 'Successful orbital insertion, lander descent, and rover traversal in Utopia Planitia' }
      ]
    }
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    chineseName: '木星',
    tagline: 'Colossal Storm Monarch & Planetary Shield',
    type: 'gas_giant',
    physical: {
      meanRadiusKm: 69911,
      massKg: '1.898 × 10²⁷',
      surfaceGravityMps2: 24.79,
      surfaceTempKelvin: { min: 110, mean: 165, max: 200 },
      meanOrbitRadiusAU: 5.204,
      orbitalPeriodEarthDays: 4332.59,
      rotationPeriodHours: 9.925,
      axialTiltDegrees: 3.13,
      moonsKnownCount: 95
    },
    visual: {
      displayRadius: 5.6,
      orbitDistance: 62,
      baseColor: '#C88B52',
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#B87B42',
        density: 0.45,
        composition: [{ gas: 'Hydrogen (H₂)', percentage: 89.8 }, { gas: 'Helium (He)', percentage: 10.2 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'More massive than all other solar system planets combined. Protects the inner terrestrial planets by gravitational diversion of cometary impacts.',
      notableMissions: [
        { name: 'Galileo', agency: 'NASA', year: '1995-2003', achievement: 'First dedicated Jovian orbiter; launched atmospheric descent probe' },
        { name: 'Juno', agency: 'NASA', year: '2016-Present', achievement: 'Deep polar gravity mapping reveals diffuse core and auroral dynamos' }
      ]
    }
  },
  {
    id: 'saturn',
    name: 'Saturn',
    chineseName: '土星',
    tagline: 'Jewel of the Solar System — The Magnificent Ringed Wonder',
    type: 'gas_giant',
    physical: {
      meanRadiusKm: 58232,
      massKg: '5.683 × 10²⁶',
      surfaceGravityMps2: 10.44,
      surfaceTempKelvin: { min: 84, mean: 134, max: 150 },
      meanOrbitRadiusAU: 9.582,
      orbitalPeriodEarthDays: 10759.22,
      rotationPeriodHours: 10.56,
      axialTiltDegrees: 26.73,
      moonsKnownCount: 146
    },
    visual: {
      displayRadius: 4.8,
      orbitDistance: 80,
      baseColor: '#E2BF7D',
      rings: {
        innerRadiusRatio: 1.35,
        outerRadiusRatio: 2.45,
        textureType: 'saturn_cassini',
        tiltDegrees: 26.73
      },
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#D8B66F',
        density: 0.4,
        composition: [{ gas: 'Hydrogen (H₂)', percentage: 96.3 }, { gas: 'Helium (He)', percentage: 3.25 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'Adorned with the most intricate and vast ring system in the solar system, spanning 282,000 km across yet only tens of meters thick.',
      notableMissions: [
        { name: 'Cassini-Huygens', agency: 'NASA/ESA/ASI', year: '1997-2017', achievement: '13-year grand tour; landed Huygens on Titan and discovered liquid water geysers on Enceladus' },
        { name: 'Voyager 1 & 2', agency: 'NASA', year: '1980-1981', achievement: 'First high-resolution imagery revealing tens of thousands of individual ringlets and Cassini division dynamics' }
      ]
    }
  },
  {
    id: 'uranus',
    name: 'Uranus',
    chineseName: '天王星',
    tagline: 'The Tilted Cyan Ice Giant',
    type: 'ice_giant',
    physical: {
      meanRadiusKm: 25362,
      massKg: '8.681 × 10²⁵',
      surfaceGravityMps2: 8.69,
      surfaceTempKelvin: { min: 49, mean: 76, max: 85 },
      meanOrbitRadiusAU: 19.201,
      orbitalPeriodEarthDays: 30685.4,
      rotationPeriodHours: -17.24, // Retrograde & tilted on side
      axialTiltDegrees: 97.77,
      moonsKnownCount: 28
    },
    visual: {
      displayRadius: 3.5,
      orbitDistance: 98,
      baseColor: '#78C7D2',
      rings: {
        innerRadiusRatio: 1.4,
        outerRadiusRatio: 1.7,
        textureType: 'uranus_thin',
        tiltDegrees: 97.77
      },
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#6FBEC9',
        density: 0.5,
        composition: [{ gas: 'Hydrogen (H₂)', percentage: 82.5 }, { gas: 'Helium (He)', percentage: 15.2 }, { gas: 'Methane (CH₄)', percentage: 2.3 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'Rolls on its side with a 98° axial tilt, inducing decades-long continuous polar days and nights.',
      notableMissions: [
        { name: 'Voyager 2', agency: 'NASA', year: '1986', achievement: 'Only human spacecraft flyby; discovered 10 new moons and mapped faint shepherd rings' }
      ]
    }
  },
  {
    id: 'neptune',
    name: 'Neptune',
    chineseName: '海王星',
    tagline: 'Azure Realm of Supersonic Winds',
    type: 'ice_giant',
    physical: {
      meanRadiusKm: 24622,
      massKg: '1.024 × 10²⁶',
      surfaceGravityMps2: 11.15,
      surfaceTempKelvin: { min: 55, mean: 72, max: 80 },
      meanOrbitRadiusAU: 30.047,
      orbitalPeriodEarthDays: 60189.0,
      rotationPeriodHours: 16.11,
      axialTiltDegrees: 28.32,
      moonsKnownCount: 16
    },
    visual: {
      displayRadius: 3.4,
      orbitDistance: 115,
      baseColor: '#3668D9',
      atmosphere: {
        hasAtmosphere: true,
        colorHex: '#2E58C4',
        density: 0.55,
        composition: [{ gas: 'Hydrogen (H₂)', percentage: 80.0 }, { gas: 'Helium (He)', percentage: 19.0 }, { gas: 'Methane (CH₄)', percentage: 1.5 }]
      }
    },
    humanityRole: {
      status: 'robotic_reconnaissance',
      description: 'Exhibits the solar system’s fastest atmospheric jet streams exceeding 2,100 km/h and captures retrograde moon Triton.',
      notableMissions: [
        { name: 'Voyager 2', agency: 'NASA', year: '1989', achievement: 'Discovered the Great Dark Spot and active cryovolcanic geysers on moon Triton' }
      ]
    }
  }
];

export function getCelestialBodyById(id: string): CelestialBody | undefined {
  return CELESTIAL_BODIES.find(b => b.id.toLowerCase() === id.toLowerCase());
}
