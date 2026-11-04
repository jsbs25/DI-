/**
 * EARTH ONE - PLANET ECOSYSTEM MAP
 *
 * Single source of truth mapping each celestial body in the Universe Engine
 * to its digital ecosystem inside the EARTH ONE platform.
 *
 * This keeps the telemetry drawer and the App-level routing in sync without
 * duplicating strings. Unavailable ecosystems are shown honestly as
 * "under construction" rather than faked.
 */

export interface PlanetEcosystem {
  planetId: string;
  /** App.tsx `currentTab` to switch to when the ecosystem is available. */
  tab: string;
  titleZh: string;
  titleEn: string;
  /** False = ecosystem not yet implemented; the UI must show a real empty state. */
  available: boolean;
  /** Tailwind gradient classes for the "enter ecosystem" button. */
  buttonClass: string;
  descriptionZh: string;
}

export const PLANET_ECOSYSTEMS: Record<string, PlanetEcosystem> = {
  sun: {
    planetId: 'sun',
    tab: 'library',
    titleZh: '世界图书馆',
    titleEn: 'World Library',
    available: true,
    buttonClass: 'from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500',
    descriptionZh: '全球数字图书馆与知识中心'
  },
  mercury: {
    planetId: 'mercury',
    tab: 'mercury',
    titleZh: '全球搜索',
    titleEn: 'World Search',
    available: true,
    buttonClass: 'from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500',
    descriptionZh: '全球搜索与信息发现中心'
  },
  venus: {
    planetId: 'venus',
    tab: '',
    titleZh: '音乐与艺术',
    titleEn: 'Music & Art',
    available: false,
    buttonClass: 'from-rose-500 to-pink-600',
    descriptionZh: '全球音乐与艺术生态'
  },
  earth: {
    planetId: 'earth',
    tab: 'globe',
    titleZh: '人类世界',
    titleEn: 'Humanity',
    available: true,
    buttonClass: 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500',
    descriptionZh: '全球社交与人类连接'
  },
  moon: {
    planetId: 'moon',
    tab: '',
    titleZh: '全球学院',
    titleEn: 'Global Academy',
    available: false,
    buttonClass: 'from-slate-400 to-slate-500',
    descriptionZh: '全球教育与学习中心'
  },
  mars: {
    planetId: 'mars',
    tab: 'game',
    titleZh: '游戏宇宙',
    titleEn: 'Game Universe',
    available: true,
    buttonClass: 'from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500',
    descriptionZh: '全球游戏与互动娱乐中心'
  },
  jupiter: {
    planetId: 'jupiter',
    tab: 'browser',
    titleZh: '宇宙浏览器',
    titleEn: 'Cosmic Browser',
    available: true,
    buttonClass: 'from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500',
    descriptionZh: '全球智能浏览器'
  },
  saturn: {
    planetId: 'saturn',
    tab: 'saturn',
    titleZh: '影视宇宙',
    titleEn: 'Cinema Universe',
    available: true,
    buttonClass: 'from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500',
    descriptionZh: '全球影视娱乐中心'
  },
  uranus: {
    planetId: 'uranus',
    tab: 'aihub',
    titleZh: '人工智能中心',
    titleEn: 'AI Intelligence',
    available: true,
    buttonClass: 'from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500',
    descriptionZh: '全球人工智能中枢'
  },
  neptune: {
    planetId: 'neptune',
    tab: 'creator',
    titleZh: '创作者宇宙',
    titleEn: 'Creator Universe',
    available: true,
    buttonClass: 'from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500',
    descriptionZh: '全球创作者与数字媒体中心'
  }
};

export function getPlanetEcosystem(planetId: string): PlanetEcosystem | undefined {
  return PLANET_ECOSYSTEMS[planetId];
}
