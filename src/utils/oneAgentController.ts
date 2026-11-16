export interface VenusAgentAction {
  seq: number;
  kind: 'crawl_and_play';
  query?: string;
}

export interface SaturnAgentAction {
  seq: number;
  query: string;
  platform?: 'all' | 'bilibili' | 'youtube';
  autoPlayRandom?: boolean;
}

export type OneAgentAction =
  | {
      type: 'play_music';
      query?: string;
      crawl?: boolean;
      control?: 'next' | 'prev' | 'pause' | 'resume';
      reply: string;
    }
  | {
      type: 'watch_documentary';
      query: string;
      platform?: 'all' | 'bilibili' | 'youtube';
      randomPick?: boolean;
      reply: string;
    }
  | { type: 'navigate_tab'; tab: string; reply: string }
  | { type: 'browser_search'; query: string; reply: string }
  | { type: 'fly_to'; lat: number; lng: number; place: string; reply: string }
  | { type: 'set_theme'; theme: 'dark' | 'light'; reply: string }
  | { type: 'set_language'; lang: 'zh' | 'en'; reply: string }
  | { type: 'none' };

const RANDOM_DOCUMENTARY_TOPICS = [
  '宇宙 天文 纪录片 4K',
  '地球 自然 纪录片',
  '深海 探索 纪录片',
  '人类 文明 历史 纪录片',
  '太空 空间站 纪录片',
];

const PLACE_COORDS: Array<{ names: string[]; lat: number; lng: number; zh: string; en: string }> = [
  { names: ['北京', 'beijing'], lat: 39.9042, lng: 116.4074, zh: '北京', en: 'Beijing' },
  { names: ['上海', 'shanghai'], lat: 31.2304, lng: 121.4737, zh: '上海', en: 'Shanghai' },
  { names: ['深圳', 'shenzhen'], lat: 22.5431, lng: 114.0579, zh: '深圳', en: 'Shenzhen' },
  { names: ['香港', 'hong kong'], lat: 22.3193, lng: 114.1694, zh: '香港', en: 'Hong Kong' },
  { names: ['东京', 'tokyo'], lat: 35.6762, lng: 139.6503, zh: '东京', en: 'Tokyo' },
  { names: ['巴黎', 'paris'], lat: 48.8566, lng: 2.3522, zh: '巴黎', en: 'Paris' },
  { names: ['伦敦', 'london'], lat: 51.5074, lng: -0.1278, zh: '伦敦', en: 'London' },
  { names: ['纽约', 'new york'], lat: 40.7128, lng: -74.006, zh: '纽约', en: 'New York' },
  { names: ['开罗', 'cairo'], lat: 30.0444, lng: 31.2357, zh: '开罗', en: 'Cairo' },
  { names: ['麦加', 'mecca', 'makkah'], lat: 21.4225, lng: 39.8262, zh: '麦加', en: 'Mecca' },
  { names: ['迪拜', 'dubai'], lat: 25.2048, lng: 55.2708, zh: '迪拜', en: 'Dubai' },
  { names: ['新加坡', 'singapore'], lat: 1.3521, lng: 103.8198, zh: '新加坡', en: 'Singapore' },
  { names: ['悉尼', 'sydney'], lat: -33.8688, lng: 151.2093, zh: '悉尼', en: 'Sydney' },
  { names: ['冰岛', 'iceland'], lat: 64.9631, lng: -19.0208, zh: '冰岛', en: 'Iceland' },
  { names: ['瑞士', 'switzerland'], lat: 46.8182, lng: 8.2275, zh: '瑞士', en: 'Switzerland' },
];

function extractMusicQuery(raw: string): string {
  let cleaned = raw
    .replace(/(我想|我要|帮我|请帮我|给我|麻烦|随便|随机|自动|去|爬取|爬群|爬一首|爬点|找一首|找点|播放|放一首|放首|来一首|来首|听一首|听首|听歌|听音乐|听点歌|听|放歌|放音乐|开音乐|play|some|song|music|listen to|track)/gi, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
    .trim();
  if (cleaned.length <= 1 || /^(歌|音乐|曲子|曲)$/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function extractDocumentaryQuery(raw: string): string {
  const lower = raw.toLowerCase();
  let cleaned = raw
    .replace(/(我想|我要|帮我|请帮我|给我|随便|随机|自动|去看|看那个|看个|看一部|看部|打开那个|打开|搜索一个|搜索|搜一个|搜一下|找一个|找部|看|纪录片|电影|视频|片子|影视|documentary|watch|movie|video|film|about|on)/gi, ' ')
    .replace(/[的关于，。！？、,.!?]/g, ' ')
    .trim();

  if (cleaned.length >= 2) {
    return `${cleaned} ${lower.includes('documentary') ? 'documentary' : '纪录片'}`;
  }
  if (lower.includes('电影') || lower.includes('科幻') || lower.includes('movie') || lower.includes('film')) {
    return '宇宙 科幻 电影 解说';
  }
  const idx = Math.floor(Math.random() * RANDOM_DOCUMENTARY_TOPICS.length);
  return RANDOM_DOCUMENTARY_TOPICS[idx];
}

export function parseInstantAgentAction(text: string, isZh: boolean): OneAgentAction | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Music playback controls
  if (/下一首|换首歌|切歌|next song|next track/i.test(raw)) {
    return { type: 'play_music', control: 'next', reply: isZh ? '好的，已为您切换到下一首。' : 'Skipped to next track.' };
  }
  if (/上一首|previous song|previous track/i.test(raw)) {
    return { type: 'play_music', control: 'prev', reply: isZh ? '好的，回到上一首。' : 'Playing previous track.' };
  }
  if (/暂停音乐|暂停播放|停止音乐|别放歌|pause music|stop music/i.test(raw)) {
    return { type: 'play_music', control: 'pause', reply: isZh ? '好的，已暂停音乐。' : 'Music paused.' };
  }
  if (/继续放歌|继续播放音乐|恢复音乐|resume music/i.test(raw)) {
    return { type: 'play_music', control: 'resume', reply: isZh ? '好的，继续为您播放。' : 'Resuming playback.' };
  }

  // 2. Crawl & Play Music
  if (/听歌|放歌|放音乐|听音乐|放一首|听一首|来一首|来首歌|爬.*歌|play.*(song|music)|listen to music/i.test(raw)) {
    const query = extractMusicQuery(raw);
    return {
      type: 'play_music',
      query,
      crawl: true,
      reply: query
        ? isZh
          ? `好的，正在自动搜索并爬取「${query}」为您播放。`
          : `Crawling and playing ${query} for you.`
        : isZh
          ? '好的，正在为您自动爬取并播放一首歌曲。'
          : 'Crawling and playing a track for you now.',
    };
  }

  // 3. Search & Auto-Open Documentary / Cinema Video
  if (/纪录片|记录片|看电影|看视频|看片|影院|星环影院|documentary|watch.*(movie|video|film|doc)/i.test(raw)) {
    const query = extractDocumentaryQuery(raw);
    const platform = /b站|bilibili/i.test(raw) ? 'bilibili' : /youtube/i.test(raw) ? 'youtube' : 'all';
    return {
      type: 'watch_documentary',
      query,
      platform,
      randomPick: true,
      reply: isZh
        ? `好的，正在为您打开影院并自动搜索播放「${query}」。`
        : `Opening cinema and searching for ${query}.`,
    };
  }

  // 4. Explicit Browser Web Search
  if (/^(帮我|请)?(上网|用浏览器|在浏览器)?(查一下|搜一下|搜索|百度一下|谷歌一下)/.test(raw) || /打开浏览器/i.test(raw)) {
    const q = raw
      .replace(/^(帮我|请)?(上网|用浏览器|在浏览器)?(查一下|搜一下|搜索|百度一下|谷歌一下|打开浏览器)/i, '')
      .trim();
    if (q) {
      return {
        type: 'browser_search',
        query: q,
        reply: isZh ? `好的，正在浏览器中为您搜索「${q}」。` : `Searching for ${q} in browser.`,
      };
    }
    return {
      type: 'navigate_tab',
      tab: 'browser',
      reply: isZh ? '好的，已打开空间浏览器。' : 'Opening Web Browser.',
    };
  }

  // 5. Theme & Language Controls
  if (/深色模式|暗黑模式|黑夜模式|夜间模式|dark mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'dark', reply: isZh ? '已切换为深色模式。' : 'Switched to dark mode.' };
  }
  if (/浅色模式|明亮模式|白天模式|日间模式|light mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'light', reply: isZh ? '已切换为浅色模式。' : 'Switched to light mode.' };
  }
  if (/切换英文|换成英文|用英文|english mode|switch to english/i.test(raw)) {
    return { type: 'set_language', lang: 'en', reply: 'Switched interface language to English.' };
  }
  if (/切换中文|换成中文|用中文|chinese mode|switch to chinese/i.test(raw)) {
    return { type: 'set_language', lang: 'zh', reply: '已切换界面语言为中文。' };
  }

  // 6. Globe Fly-To Destinations
  if (/带我去|飞到|飞往|定位到|看看/.test(raw)) {
    for (const p of PLACE_COORDS) {
      if (p.names.some((n) => lower.includes(n))) {
        return {
          type: 'fly_to',
          lat: p.lat,
          lng: p.lng,
          place: isZh ? p.zh : p.en,
          reply: isZh ? `好的，正在带您前往${p.zh}。` : `Flying to ${p.en}.`,
        };
      }
    }
  }

  // 7. Full-Website Module Navigation
  const navRules: Array<{ test: RegExp; tab: string; zh: string; en: string }> = [
    { test: /语言学习|学英语|英语引擎|阿拉伯语|arabic|english learning|language center/i, tab: 'arabic-learning', zh: '语言学习中心', en: 'Language Center' },
    { test: /信息与通话|信息|消息|通话|私信|发消息|chat|messenger|message/i, tab: 'chat', zh: '信息与通话', en: 'Messages' },
    { test: /发现|动态|广场|feed|discover/i, tab: 'feed', zh: '发现动态', en: 'Discover' },
    { test: /音乐馆|音乐空间|music/i, tab: 'venus', zh: '音乐空间', en: 'Music Space' },
    { test: /影视中心|视频中心/i, tab: 'video', zh: '影视视频中心', en: 'Video Center' },
    { test: /图书馆|看书|读书|library/i, tab: 'library', zh: '世界数字图书馆', en: 'Digital Library' },
    { test: /宇宙|星空|太阳系|universe/i, tab: 'universe', zh: '3D 宇宙引擎', en: 'Universe Engine' },
    { test: /天文台|月球|observatory|moon/i, tab: 'moon', zh: '天文观测台', en: 'Observatory' },
    { test: /全网索引|水星搜索|mercury/i, tab: 'mercury', zh: '全网索引', en: 'Global Index' },
    { test: /知识图谱|knowledge/i, tab: 'knowledge', zh: '全域知识图谱', en: 'Knowledge Universe' },
    { test: /智能中枢|智能工作台|ai工作台|ai hub/i, tab: 'aihub', zh: 'AI 智能中枢', en: 'AI Hub' },
    { test: /爬虫|采集中心|crawler/i, tab: 'crawler', zh: '采集网络中枢', en: 'Crawler Hub' },
    { test: /网络中心|代理|vpn|network/i, tab: 'network', zh: '网络中心', en: 'Network Center' },
    { test: /社区|聚落|community/i, tab: 'community', zh: '数字社区', en: 'Communities' },
    { test: /创作中心|写文章|creator/i, tab: 'creator', zh: '创作中心', en: 'Creator Studio' },
    { test: /游戏中心|玩游戏|game/i, tab: 'game', zh: '游戏中心', en: 'Game Center' },
    { test: /品牌|brand/i, tab: 'brand', zh: '品牌视觉系统', en: 'Brand System' },
    { test: /首页|主页|地球|回到桌面|home|globe/i, tab: 'globe', zh: '首页', en: 'Home' },
  ];

  for (const r of navRules) {
    if (r.test.test(raw)) {
      return {
        type: 'navigate_tab',
        tab: r.tab,
        reply: isZh ? `好的，已为您打开${r.zh}。` : `Opening ${r.en}.`,
      };
    }
  }

  return null;
}

export async function resolveNaturalAgentAction(text: string, isZh: boolean): Promise<OneAgentAction> {
  const instant = parseInstantAgentAction(text, isZh);
  if (instant) return instant;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch('/api/ai/agent-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: isZh ? 'zh' : 'en' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data.action && data.action.type && data.action.type !== 'none') {
        return data.action as OneAgentAction;
      }
    }
  } catch {
    // non-fatal, fallback to pure voice chat
  }
  return { type: 'none' };
}
