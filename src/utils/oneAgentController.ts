import { solvePrecisionQuery } from './precisionSolver.ts';

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

export interface LibraryAgentAction {
  seq: number;
  query: string;
  autoOpen?: boolean;
}

export type OneAgentAction =
  | {
      type: 'play_music';
      query?: string;
      crawl?: boolean;
      control?: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down';
      volume?: number;
      reply: string;
    }
  | { type: 'open_book'; query: string; reply: string }
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
  | { type: 'earth_control'; action: 'spin' | 'stop_spin' | 'focus'; lat?: number; lng?: number; place?: string; reply: string }
  | { type: 'set_theme'; theme: 'dark' | 'light'; reply: string }
  | { type: 'set_language'; lang: 'zh' | 'en' | 'ar'; reply: string }
  | { type: 'click_element'; selector?: string; label?: string; reply: string }
  | { type: 'fill_input'; selector?: string; label?: string; value: string; reply: string }
  | { type: 'scroll_page'; direction: 'up' | 'down' | 'top' | 'bottom'; amount?: number; reply: string }
  | { type: 'social_action'; action: 'open_chat' | 'open_feed' | 'start_call'; target?: string; reply: string }
  | { type: 'launch_game'; query?: string; reply: string }
  | { type: 'set_companion_emotion'; emotion: 'calm' | 'happy' | 'excited' | 'curious' | 'concerned' | 'empathetic' | 'playful' | 'focused' | 'thinking'; reply: string }
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
  if (/轻音乐|纯音乐|安静|舒缓|放松|助眠|睡眠|冥想|治愈/.test(raw)) return 'ambient';
  if (/钢琴|古典|月光|德彪西|莫扎特|贝多芬|最好的/.test(raw)) return 'Clair de Lune';
  if (/学习|专注|工作|自习|阅读/.test(raw)) return 'lofi';
  if (/吉他|民谣/.test(raw)) return 'acoustic';
  if (/电子|电音|动感|运动|跑步/.test(raw)) return 'electronic';
  if (/合成|浪潮|赛博/.test(raw)) return 'synthwave';

  const cleaned = raw
    .replace(
      /(我想|我要|帮我|请帮我|给我|麻烦|请|能不能|可以|吗|吧|啊|呢|了|的|随便|随机|自动|去|打开那个|打开|开启|开一下|进入|切换到|切到|调出|爬取|爬群|爬一首|爬点|找一首|找点|找个|播放|放一首|放首|放点|来一首|来首|来点|听一首|听首|听点|听歌|听音乐|放歌|放音乐|开音乐|那个|一点|一首|最好|好听|首歌|歌曲|音乐|曲子|曲|play|open|start|launch|some|best|song|music|listen to|track)/gi,
      ' '
    )
    .replace(/[，。！？、,.!?]/g, ' ')
    .trim();
  if (cleaned.length <= 1 || /^(歌|音乐|曲子|曲|一下|点)$/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function extractDocumentaryQuery(raw: string): string {
  const lower = raw.toLowerCase();
  const cleaned = raw
    .replace(/(我想|我要|帮我|请帮我|给我|麻烦|随便|随机|自动|去看|看那个|看个|看一部|看部|打开那个|打开|搜索一个|搜索|搜一个|搜一下|找一个|找部|看|纪录片|记录片|电影|视频|片子|影视|的|关于|吧|啊|documentary|watch|movie|video|film|about|on)/gi, ' ')
    .replace(/[，。！？、,.!?]/g, ' ')
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

function extractBookQuery(raw: string): string {
  const bracketed = raw.match(/《([^》]{1,40})》/)?.[1];
  if (bracketed && bracketed.trim()) return bracketed.trim();

  const enMatch = raw.match(/(?:read|open|find|search|book)\s+(?:the\s+book\s+|a\s+book\s+(?:about|on)\s+)?(.+)/i)?.[1];
  const candidate = (enMatch || raw)
    .replace(
      /(我想|我要|帮我|请帮我|给我|麻烦|请|去|去图书馆|在图书馆|打开那个|打开|翻开|看一看|看下|看个|看本|看一本|看这本|看那本|看一下|看看|找本|找一本|找个|找点|读本|读一本|读一下|搜本|搜一本|搜索|搜一下|听一下|看|读|找|关于|这本书|那本书|一本书|的书|书吧|书籍|书本|书|吧|啊|呀|哦|吗|呢|了|的|read|open|find|search|book|books|about|the|a)/gi,
      ' '
    )
    .replace(/[《》「」『』""''，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (candidate.length >= 1 && !/^(一下|点|些|什么)$/i.test(candidate)) {
    return candidate;
  }
  return '';
}

export function extractInlineAgentDirective(rawText: string): {
  action: OneAgentAction | null;
  spokenText: string;
  emotion: string | null;
} {
  const text = rawText.trim();
  let working = text;
  let emotion: string | null = null;
  const emoMatch = working.match(/^\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]\s*/i);
  if (emoMatch) {
    emotion = emoMatch[1].toLowerCase();
    working = working.slice(emoMatch[0].length);
  }
  const match = working.match(/^\[\[ACTION:(\{[\s\S]*?\})\]\]\s*/);
  if (!match) {
    return { action: null, spokenText: working, emotion };
  }
  let parsedAction: OneAgentAction | null = null;
  try {
    const obj = JSON.parse(match[1]);
    if (obj && typeof obj.type === 'string' && obj.type !== 'none') {
      parsedAction = { reply: '', ...obj } as OneAgentAction;
      if (parsedAction.type === 'set_companion_emotion' && typeof (parsedAction as any).emotion === 'string') {
        emotion = (parsedAction as any).emotion;
      }
    }
  } catch {}
  const spokenText = working.slice(match[0].length).trim();
  return { action: parsedAction, spokenText, emotion };
}

function isConversationalFraming(
  raw: string,
  history?: Array<{ role: string; content: string }>
): boolean {
  const clean = raw
    .trim()
    .replace(/多林国/g, '多邻国')
    .replace(/记录片/g, '纪录片');
  if (!clean) return false;

  // Negation / boundary statements ("别打开音乐", "不要去图书馆", "不是让你放歌", "不希望它像机器人")
  if (/(?:别打开|不要打开|别去|不要去|不用打开|不用放|不是让你|不希望|不要总是|别用)/.test(clean)) {
    return true;
  }

  // Design / brainstorming / hypothetical framing ("我想做一个AI，能陪我聊天也可以放音乐看书")
  if (/(?:我想做一个|我要做一个|正在开发|正在设计|构想|讨论一下|比如|例如|如果|既能.+又能|不仅.+还能|我希望它(?:能够?)?|设计一个|打造一个|用来)/.test(clean)) {
    return true;
  }

  // Informational questions asking *about* a module instead of launching it ("多邻国能学啥", "宇宙为什么黑")
  if (/(?:能学啥|是什么|什么意思|为什么|有什么功能|怎么样|好用吗|原理|区别)/.test(clean) && !/^(打开|进入|切换|去|播放|放|听|看|读|找)/.test(clean)) {
    return true;
  }

  // Follow-up markers tied to an existing discussion
  if (Array.isArray(history) && history.length > 0 && /^(?:对[，,\s]*|嗯[，,\s]*|没错[，,\s]*|但是|不过|可是|其实|那如果)/.test(clean)) {
    return true;
  }

  return false;
}

export function parseInstantAgentAction(
  text: string,
  isZh: boolean,
  history?: Array<{ role: string; content: string }>
): OneAgentAction | null {
  const raw = text
    .trim()
    .replace(/多林国/g, '多邻国')
    .replace(/记录片/g, '纪录片');
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Highest priority: Music playback stop / pause / resume / skip (direct transport commands)
  if (
    /停止播放|停止放歌|停止音乐|别放了|别播了|别放歌|别唱了|关掉音乐|关闭音乐|关闭播放|关了音乐|把音乐关|把歌关|把音乐停|把歌停|停一下|停下|停了吧|停吧|不听了|不要听了|暂停播放|暂停音乐|stop playing|stop music|stop the music|turn off music|pause music|^停$|^stop$|^pause$/i.test(
      raw
    )
  ) {
    return {
      type: 'play_music',
      control: 'stop',
      reply: isZh ? '好的，已停止播放音乐。' : 'Okay, music stopped.',
    };
  }
  if (/继续播放|继续放歌|继续放|继续听|接着放|接着播|恢复播放|恢复音乐|再放音乐|resume music|resume playing|continue playing/i.test(raw)) {
    return {
      type: 'play_music',
      control: 'resume',
      reply: isZh ? '好的，继续为你播放音乐。' : 'Resuming your music now.',
    };
  }
  if (/下一首|下一曲|换一首|换首歌|换个歌|换下一首|切换下一首|切歌|不好听|换一个歌|next song|next track|skip track/i.test(raw)) {
    return { type: 'play_music', control: 'next', reply: isZh ? '好的，帮你切到下一首歌。' : 'Skipping to the next track.' };
  }
  if (/上一首|上一曲|previous song|previous track/i.test(raw)) {
    return { type: 'play_music', control: 'prev', reply: isZh ? '好的，切回上一首歌。' : 'Going back to the previous track.' };
  }

  // Conversational framing / brainstorming / informational questions must NOT hijack tabs
  if (isConversationalFraming(raw, history)) {
    return null;
  }

  // 2. Crawl & Play Music (natural expressions)
  if (
    /听歌|听首歌|听点歌|想听歌|放歌|放首歌|放点歌|放音乐|听音乐|播放音乐|开音乐|来首歌|来点音乐|来一首|放一首|听一首|打开.*音乐|开启.*音乐|进入.*音乐|去.*音乐|听钢琴|放钢琴|听轻音乐|放轻音乐|听纯音乐|爬.*歌|play.*(song|music|track)|open.*music|listen to music/i.test(
      raw
    )
  ) {
    const query = extractMusicQuery(raw);
    return {
      type: 'play_music',
      query,
      crawl: true,
      reply: query
        ? isZh
          ? `好的，正在为你寻找并播放${query}。`
          : `Playing ${query} for you now.`
        : isZh
          ? '好的，已打开音乐并开始播放。'
          : 'Opening music and starting playback.',
    };
  }

  // 3. Auto-Search & Auto-Open Book in Digital Library (works seamlessly on mobile & desktop)
  const mentionsSiteModule =
    /(多邻国|多林国|语言学习|音乐|影视|视频|纪录片|记录片|影院|浏览器|宇宙|星空|天文台|知识图谱|工作台|智能中枢|爬虫|网络中心|社区|创作中心|游戏中心|品牌|首页|主页|消息|信息|发现|广场|duolingo|music|video|browser|universe|observatory|ai hub|crawler|community|creator|game|home|globe)/i.test(
      raw
    );
  if (
    /《[^》]{1,40}》/.test(raw) ||
    /(我想|我要|帮我|请|去|给我)?(看|读|找|搜|查|打开|翻开|听).{0,16}(这本|一本|那本|本|个)?书/.test(raw) ||
    (!mentionsSiteModule &&
      /(我想看|我要看|找一本|找本|搜一本|读一本|翻开)\s*[\u4e00-\u9fffA-Za-z0-9]{2,20}(?=书|$)/.test(raw)) ||
    /\b(read|open|find)\b.*\b(book|novel|ebook|audiobook)\b/i.test(raw)
  ) {
    const query = extractBookQuery(raw);
    if (query) {
      return {
        type: 'open_book',
        query,
        reply: isZh
          ? `好的，正在图书馆为你检索并打开《${query}》。`
          : `Finding and opening ${query} in the library.`,
      };
    }
    return {
      type: 'navigate_tab',
      tab: 'library',
      reply: isZh ? '好的，已打开世界数字图书馆，想看哪本书可以直接告诉我。' : 'Digital Library is open. Tell me which book you want to read.',
    };
  }

  // 4. Search & Auto-Open Documentary / Cinema Video
  if (/纪录片|记录片|看电影|看视频|看大片|看片|影院|星环影院|documentary|watch.*(movie|video|film|doc)/i.test(raw)) {
    const query = extractDocumentaryQuery(raw);
    const platform = /b站|bilibili/i.test(raw) ? 'bilibili' : /youtube/i.test(raw) ? 'youtube' : 'all';
    return {
      type: 'watch_documentary',
      query,
      platform,
      randomPick: true,
      reply: isZh
        ? `好的，正在打开影院并播放「${query}」。`
        : `Opening cinema and queuing ${query}.`,
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
        reply: isZh ? `好的，正在浏览器为你搜索「${q}」。` : `Searching for ${q} right now.`,
      };
    }
    return {
      type: 'navigate_tab',
      tab: 'browser',
      reply: isZh ? '好的，已打开浏览器。' : 'Web browser is open.',
    };
  }

  // 5. Theme & Language Controls
  if (/深色模式|暗黑模式|黑夜模式|夜间模式|dark mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'dark', reply: isZh ? '好的，已切换到深色模式。' : 'Switched to dark mode.' };
  }
  if (/浅色模式|明亮模式|白天模式|日间模式|light mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'light', reply: isZh ? '好的，已切换到浅色模式。' : 'Switched to light mode.' };
  }
  if (/切换英文|换成英文|用英文|english mode|switch to english/i.test(raw)) {
    return { type: 'set_language', lang: 'en', reply: 'Switched to English, how can I help?' };
  }
  if (/切换中文|换成中文|用中文|chinese mode|switch to chinese/i.test(raw)) {
    return { type: 'set_language', lang: 'zh', reply: '好的，已切回中文。' };
  }

  // 6. Globe Fly-To Destinations
  if (/带我去|飞到|飞往|定位到|去看看/.test(raw)) {
    for (const p of PLACE_COORDS) {
      if (p.names.some((n) => lower.includes(n))) {
        return {
          type: 'fly_to',
          lat: p.lat,
          lng: p.lng,
          place: isZh ? p.zh : p.en,
          reply: isZh ? `好的，带你飞往${p.zh}。` : `Flying you to ${p.en}.`,
        };
      }
    }
  }

  // 7. Full-Website Module Navigation
  const navRules: Array<{ test: RegExp; tab: string; zh: string; en: string }> = [
    { test: /多邻国|多林国|语言学习|学英语|学中文|学韩语|学日语|学法语|学西语|学语言|英语引擎|阿拉伯语|duolingo|arabic|english learning|language center|language learning/i, tab: 'arabic-learning', zh: '语言学习中心', en: 'Language Center' },
    { test: /信息与通话|打开信息|打开消息|发消息|通话|私信|chat|messenger|messages/i, tab: 'chat', zh: '信息与通话', en: 'Messages' },
    { test: /发现|动态|广场|feed|discover/i, tab: 'feed', zh: '发现动态', en: 'Discover' },
    { test: /音乐馆|音乐空间|音乐中心|打开音乐|music/i, tab: 'venus', zh: '音乐空间', en: 'Music Space' },
    { test: /影视中心|视频中心/i, tab: 'video', zh: '影视视频中心', en: 'Video Center' },
    { test: /图书馆|看书|读书|library/i, tab: 'library', zh: '世界数字图书馆', en: 'Digital Library' },
    { test: /宇宙|星空|太阳系|universe/i, tab: 'universe', zh: '3D 宇宙引擎', en: 'Universe Engine' },
    { test: /天文台|月球|observatory|moon/i, tab: 'moon', zh: '天文观测台', en: 'Observatory' },
    { test: /全网索引|水星搜索|mercury/i, tab: 'mercury', zh: '全网索引', en: 'Global Index' },
    { test: /知识图谱|knowledge/i, tab: 'knowledge', zh: '全域知识图谱', en: 'Knowledge Universe' },
    { test: /智能中枢|智能工作台|ai工作台|ai hub/i, tab: 'aihub', zh: 'DeepSeek 智能工作台', en: 'DeepSeek AI Hub' },
    { test: /爬虫|采集中心|crawler/i, tab: 'crawler', zh: '采集网络中枢', en: 'Crawler Hub' },
    { test: /网络中心|代理|vpn|network/i, tab: 'network', zh: '网络中心', en: 'Network Center' },
    { test: /社区|聚落|community/i, tab: 'community', zh: '数字社区', en: 'Communities' },
    { test: /创作中心|写文章|creator/i, tab: 'creator', zh: '创作中心', en: 'Creator Studio' },
    { test: /游戏中心|玩游戏|game/i, tab: 'game', zh: '游戏中心', en: 'Game Center' },
    { test: /品牌|brand/i, tab: 'brand', zh: '品牌视觉系统', en: 'Brand System' },
    { test: /回到首页|打开首页|回首页|主页|地球|回到桌面|home|globe/i, tab: 'globe', zh: '首页', en: 'Home' },
  ];

  for (const r of navRules) {
    if (r.test.test(raw)) {
      return {
        type: 'navigate_tab',
        tab: r.tab,
        reply: isZh ? `好的，已经为你打开${r.zh}。` : `Opening ${r.en} for you.`,
      };
    }
  }

  return null;
}

export function matchPureSocialBanter(text: string, isZh: boolean): string | null {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (/^(你好|您好|哈喽|嗨|在吗|在不在|喂|one|wan|hello|hi|hey)[!！?？。~～]*$/i.test(raw)) {
    return isZh
      ? '我在听，怎么啦？随时问我或者让我放首歌都行。'
      : 'Hi, I am right here. What can I help you with?';
  }
  if (/你在干嘛|干嘛呢|做什么呢|忙什么|在忙吗|在干什么|what are you doing/i.test(raw)) {
    const zhReplies = [
      '我在吃饭呢，顺便等着你找我聊天，你今天忙不忙？',
      '刚吃完饭正休息呢，一直开着在等你开口，有啥想问的？',
      '正在发呆顺便看时间呢，刚好你叫我，要听歌还是聊两句？',
    ];
    return isZh
      ? zhReplies[Math.floor(Date.now() / 4000) % zhReplies.length]
      : 'Just relaxing after a meal and right here listening for you. How is your day going?';
  }
  if (/吃饭了吗|吃了吗|吃过饭|饿不饿|吃什么|have you eaten/i.test(raw)) {
    return isZh
      ? '刚吃过饭呢，味道还不错，你今天吃得怎么样？'
      : 'Just had a good meal! How about you?';
  }
  if (/今天(过得)?怎么样|今天忙不忙|今天忙吗|今天开心吗|今天还好吗|今天累不累|今天吃什么|今天要干嘛|今天打算/i.test(raw)) {
    return isZh
      ? '今天挺轻松愉快的，我一直都在这儿陪着你，你今天安排得怎么样？'
      : 'Today is going smoothly and I am right here with you. How are your plans going today?';
  }
  if (/^(早安|早上好|good morning)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '早上好，祝你今天顺顺利利、心情愉快。'
      : 'Good morning! Wishing you a great day ahead.';
  }
  if (/^(中午好|下午好|晚上好|good afternoon|good evening)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '你好呀，状态怎么样，需要我做点什么吗？'
      : 'Hello! How is your day going so far?';
  }
  if (/^(晚安|要睡了|去睡觉|good night)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '晚安，早点休息，明天见。'
      : 'Good night, get some good rest.';
  }
  if (/好累|累死了|心累|不开心|难过|伤心|委屈|压力好大|心情不好|烦死了|焦虑|孤单|tired|sad|stressed|lonely/i.test(raw)) {
    return isZh
      ? '辛苦了，先歇口气喝口水，要我放一首舒缓点的歌陪你吗？'
      : 'Sounds like a long day. Take a breather—want me to put on some relaxing music?';
  }
  if (/^(开心|好开心|高兴|太好了|哈哈|happy|awesome)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '真替你开心，希望这样的好心情能一直延续下去。'
      : 'That is wonderful to hear! Glad things are going well.';
  }
  if (/好无聊|无聊|bored/i.test(raw) && raw.length < 10) {
    return isZh
      ? '无聊的话我可以给你放首歌、讲个冷知识，或者陪你聊聊天。'
      : 'We can put on a song, chat, or explore a book if you like.';
  }
  if (/喜欢你|爱你|真可爱|真甜|声音好听|love you|cute/i.test(raw)) {
    return isZh
      ? '谢谢夸奖呀，我会一直在你身边陪着你的。'
      : 'Thank you! I am glad to keep you company.';
  }
  if (/夸夸我|安慰我|鼓励我/i.test(raw)) {
    return isZh
      ? '你已经做得很好啦，放轻松一步步来，我一直在这里。'
      : 'You are doing great—take it one step at a time, I am right here.';
  }
  if (/讲个笑话|逗我笑|joke/i.test(raw)) {
    return isZh
      ? '为什么图书馆总是特别安静？因为每一本书都在等一个愿意翻开它的人。'
      : 'Why do books make great friends? Because every one of them waits patiently to share a story.';
  }
  if (/^(你是谁|你叫什么|who are you|what is your name)[?？!！]*$/i.test(raw)) {
    return isZh
      ? '我是 One.，随时在线陪着你，问答、放歌、找书都可以直接开口。'
      : 'I am One., your always-ready voice companion for answers, music, and books.';
  }
  if (/你能干什么|你能做什么|有什么功能|what can you do/i.test(raw)) {
    return isZh
      ? '我可以随时回答你问题、算数学、控制音乐播放切换，也能直接帮你找书打开看。'
      : 'I can answer questions, do math, control music playback, and open books for you.';
  }
  if (/^(谢谢|感谢|谢谢你|thanks|thank you)[!！。~～]*$/i.test(lower)) {
    return isZh ? '不客气，随时喊我就行。' : 'You are welcome, anytime.';
  }
  return null;
}

export function resolveConversationalFallback(text: string, isZh: boolean, _errorHint?: string): string {
  const exact = solvePrecisionQuery(text, isZh);
  if (exact) {
    return exact.answer;
  }
  const banter = matchPureSocialBanter(text, isZh);
  if (banter) return banter;

  return isZh
    ? '我暂时没有查到这条问题的直接结果，你可以换一种清晰一点的问法再问我一次。'
    : 'I did not find a direct answer for that—try asking again in slightly clearer words.';
}

export async function resolveNaturalAgentAction(text: string, isZh: boolean): Promise<OneAgentAction> {
  const instant = parseInstantAgentAction(text, isZh);
  if (instant) return instant;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
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
