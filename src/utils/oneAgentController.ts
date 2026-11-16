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

export type GameId = 'flight' | 'gravity' | 'chess' | 'gomoku' | 'trivia';

export type OneAgentAction =
  | {
      type: 'play_music';
      query?: string;
      crawl?: boolean;
      control?: 'next' | 'prev' | 'pause' | 'stop' | 'resume';
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
  | { type: 'mercury_search'; query: string; reply: string }
  | { type: 'open_game'; game: GameId; reply: string }
  | { type: 'messenger_action'; action: 'open_chat' | 'open_calls' | 'start_audio_call' | 'start_video_call'; reply: string }
  | { type: 'create_post'; content: string; category?: 'thought' | 'culture' | 'tech' | 'nature' | 'art'; reply: string }
  | { type: 'fly_to'; lat: number; lng: number; place: string; reply: string }
  | { type: 'set_theme'; theme: 'dark' | 'light'; reply: string }
  | { type: 'set_language'; lang: 'zh' | 'en'; reply: string }
  | { type: 'set_immersive'; immersive: boolean; reply: string }
  | { type: 'open_command_palette'; reply: string }
  | { type: 'replay_intro'; reply: string }
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
  { names: ['利雅得', 'riyadh'], lat: 24.7136, lng: 46.6753, zh: '利雅得', en: 'Riyadh' },
  { names: ['迪拜', 'dubai'], lat: 25.2048, lng: 55.2708, zh: '迪拜', en: 'Dubai' },
  { names: ['新加坡', 'singapore'], lat: 1.3521, lng: 103.8198, zh: '新加坡', en: 'Singapore' },
  { names: ['悉尼', 'sydney'], lat: -33.8688, lng: 151.2093, zh: '悉尼', en: 'Sydney' },
  { names: ['冰岛', 'iceland'], lat: 64.9631, lng: -19.0208, zh: '冰岛', en: 'Iceland' },
  { names: ['瑞士', 'switzerland'], lat: 46.8182, lng: 8.2275, zh: '瑞士', en: 'Switzerland' },
];

export function mapGeminiToolCallToAgentAction(
  name: string,
  args: Record<string, any>,
  isZh: boolean
): OneAgentAction {
  switch (name) {
    case 'navigate_tab':
      return {
        type: 'navigate_tab',
        tab: String(args.tab || 'globe'),
        reply: isZh ? '好的，已为您切换页面。' : `Opening ${String(args.tab || 'globe')}.`,
      };
    case 'fly_to_location':
      return {
        type: 'fly_to',
        lat: Number(args.lat) || 39.9,
        lng: Number(args.lng) || 116.4,
        place: String(args.placeName || ''),
        reply: isZh
          ? `好的，正在带您前往${String(args.placeName || '目的地')}。`
          : `Flying to ${String(args.placeName || 'destination')}.`,
      };
    case 'control_music': {
      const ctrl = String(args.control || 'stop');
      if (ctrl === 'play_query') {
        return {
          type: 'play_music',
          query: String(args.query || ''),
          crawl: true,
          reply: isZh
            ? `好的，正在打开音乐并播放${args.query ? `「${args.query}」` : ''}。`
            : `Playing music.`,
        };
      }
      const validCtrl = (['next', 'prev', 'pause', 'stop', 'resume'].includes(ctrl)
        ? ctrl
        : 'stop') as 'next' | 'prev' | 'pause' | 'stop' | 'resume';
      return {
        type: 'play_music',
        control: validCtrl,
        reply: isZh ? '好的，已更新音乐播放状态。' : 'Music control executed.',
      };
    }
    case 'watch_cinema':
      return {
        type: 'watch_documentary',
        query: String(args.query || '宇宙 纪录片'),
        platform: (['all', 'bilibili', 'youtube'].includes(String(args.platform))
          ? String(args.platform)
          : 'all') as 'all' | 'bilibili' | 'youtube',
        randomPick: args.randomPick !== false,
        reply: isZh
          ? `好的，正在打开土星影院搜索「${String(args.query || '纪录片')}」。`
          : `Opening cinema for ${String(args.query || 'documentary')}.`,
      };
    case 'browser_action':
      return {
        type: 'browser_search',
        query: String(args.queryOrUrl || ''),
        reply: isZh
          ? `好的，正在宇宙浏览器中打开「${String(args.queryOrUrl || '')}」。`
          : `Opening in Cosmic Browser.`,
      };
    case 'search_global_index':
      return {
        type: 'mercury_search',
        query: String(args.query || ''),
        reply: isZh
          ? `好的，正在水星全网索引中搜索「${String(args.query || '')}」。`
          : `Searching global index for ${String(args.query || '')}.`,
      };
    case 'open_game': {
      const g = String(args.game || 'flight');
      const validGame = (['flight', 'gravity', 'chess', 'gomoku', 'trivia'].includes(g)
        ? g
        : 'flight') as GameId;
      return {
        type: 'open_game',
        game: validGame,
        reply: isZh ? '好的，已进入游戏宇宙。' : 'Opening Game Center.',
      };
    }
    case 'open_messenger_or_call': {
      const act = String(args.action || 'open_chat');
      const validAct = (['open_chat', 'open_calls', 'start_audio_call', 'start_video_call'].includes(act)
        ? act
        : 'open_chat') as 'open_chat' | 'open_calls' | 'start_audio_call' | 'start_video_call';
      return {
        type: 'messenger_action',
        action: validAct,
        reply: isZh ? '好的，已打开信息与通话中心。' : 'Opening Messages & Calls.',
      };
    }
    case 'publish_global_post':
      return {
        type: 'create_post',
        content: String(args.content || ''),
        category: (['thought', 'culture', 'tech', 'nature', 'art'].includes(String(args.category))
          ? String(args.category)
          : 'thought') as 'thought' | 'culture' | 'tech' | 'nature' | 'art',
        reply: isZh ? '好的，已为您发布到全球广场。' : 'Published to Global Feed.',
      };
    case 'set_site_preferences':
      if (args.theme === 'dark' || args.theme === 'light') {
        return {
          type: 'set_theme',
          theme: args.theme,
          reply: isZh ? `已切换为${args.theme === 'dark' ? '深色' : '浅色'}模式。` : `Switched to ${args.theme} mode.`,
        };
      }
      if (args.lang === 'zh' || args.lang === 'en') {
        return {
          type: 'set_language',
          lang: args.lang,
          reply: args.lang === 'zh' ? '已切换为中文。' : 'Switched to English.',
        };
      }
      if (typeof args.immersive === 'boolean') {
        return {
          type: 'set_immersive',
          immersive: args.immersive,
          reply: isZh
            ? args.immersive ? '已进入沉浸地球模式。' : '已退出沉浸模式。'
            : args.immersive ? 'Entered immersive mode.' : 'Exited immersive mode.',
        };
      }
      if (args.openCommandPalette) {
        return {
          type: 'open_command_palette',
          reply: isZh ? '已打开全局命令面板。' : 'Opened Command Palette.',
        };
      }
      if (args.replayIntro) {
        return {
          type: 'replay_intro',
          reply: isZh ? '正在重播开场导览。' : 'Replaying cinematic intro.',
        };
      }
      return { type: 'none' };
    default:
      return { type: 'none' };
  }
}

function extractMusicQuery(raw: string): string {
  if (/轻音乐|纯音乐|安静|舒缓|放松|助眠|睡眠|冥想|治愈/.test(raw)) return 'ambient';
  if (/钢琴|古典|月光|德彪西|莫扎特|贝多芬/.test(raw)) return 'piano';
  if (/学习|专注|工作|自习|阅读/.test(raw)) return 'lofi';
  if (/吉他|民谣/.test(raw)) return 'acoustic';
  if (/电子|电音|动感|运动|跑步/.test(raw)) return 'electronic';
  if (/合成|浪潮|赛博/.test(raw)) return 'synthwave';

  const cleaned = raw
    .replace(
      /(我想|我要|帮我|请帮我|给我|麻烦|请|能不能|可以|吗|吧|啊|呢|了|的|随便|随机|自动|去|打开那个|打开|开启|开一下|进入|切换到|切到|调出|爬取|爬群|爬一首|爬点|找一首|找点|找个|播放|放一首|放首|放点|来一首|来首|来点|听一首|听首|听点|听歌|听音乐|放歌|放音乐|开音乐|那个|一点|一首|好听|首歌|歌曲|音乐|曲子|曲|play|open|start|launch|some|song|music|listen to|track)/gi,
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

export function parseInstantAgentAction(text: string, isZh: boolean): OneAgentAction | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Highest priority: Music playback stop / pause / resume / skip
  if (
    /停止播放|停止放歌|停止音乐|别放了|别播了|别放歌|别唱了|关掉音乐|关闭音乐|关闭播放|关了音乐|把音乐关|把歌关|把音乐停|把歌停|停一下|停下|不听了|不要听了|暂停播放|暂停音乐|stop playing|stop music|stop the music|turn off music|pause music|^stop$|^pause$/i.test(
      raw
    )
  ) {
    return {
      type: 'play_music',
      control: 'stop',
      reply: isZh ? '好的，已为您停止播放音乐。' : 'Music playback stopped.',
    };
  }
  if (/继续播放|继续放歌|继续放|继续听|接着放|接着播|恢复播放|恢复音乐|再放音乐|resume music|resume playing|continue playing/i.test(raw)) {
    return {
      type: 'play_music',
      control: 'resume',
      reply: isZh ? '好的，继续为您播放音乐。' : 'Resuming music playback.',
    };
  }
  if (/下一首|下一曲|换一首|换首歌|换个歌|切歌|不好听|换一个歌|next song|next track|skip track/i.test(raw)) {
    return { type: 'play_music', control: 'next', reply: isZh ? '好的，已为您切换到下一首。' : 'Skipped to next track.' };
  }
  if (/上一首|上一曲|previous song|previous track/i.test(raw)) {
    return { type: 'play_music', control: 'prev', reply: isZh ? '好的，回到上一首。' : 'Playing previous track.' };
  }

  // 2. Specific Games Launch
  if (/五子棋|gomoku/i.test(raw)) {
    return { type: 'open_game', game: 'gomoku', reply: isZh ? '好的，已为您打开五子棋。' : 'Launching Gomoku.' };
  }
  if (/太空象棋|国际象棋|chess/i.test(raw)) {
    return { type: 'open_game', game: 'chess', reply: isZh ? '好的，已为您启动太空国际象棋。' : 'Launching Space Chess.' };
  }
  if (/引力沙盒|gravity/i.test(raw)) {
    return { type: 'open_game', game: 'gravity', reply: isZh ? '好的，已打开引力沙盒。' : 'Launching Gravity Sandbox.' };
  }
  if (/太空飞行|3d飞行|space\s*flight/i.test(raw)) {
    return { type: 'open_game', game: 'flight', reply: isZh ? '好的，已启动三维太空飞行。' : 'Launching 3D SpaceFlight.' };
  }

  // 3. Crawl & Play Music
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
          ? `好的，正在打开音乐并为您播放「${query}」。`
          : `Opening music and playing ${query} for you.`
        : isZh
          ? '好的，已为您打开音乐并自动播放。'
          : 'Opening music and playing a track for you now.',
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
        ? `好的，正在为您打开影院并自动搜索播放「${query}」。`
        : `Opening cinema and searching for ${query}.`,
    };
  }

  // 5. Explicit Browser Web Search
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

  // 6. Theme, Language, Immersive & Command Palette Controls
  if (/退出沉浸|关闭沉浸|exit immersive/i.test(raw)) {
    return { type: 'set_immersive', immersive: false, reply: isZh ? '已退出沉浸模式。' : 'Exited immersive mode.' };
  }
  if (/沉浸模式|进入沉浸|immersive mode/i.test(raw)) {
    return { type: 'set_immersive', immersive: true, reply: isZh ? '已进入沉浸地球模式。' : 'Entered immersive mode.' };
  }
  if (/命令面板|快捷面板|command palette/i.test(raw)) {
    return { type: 'open_command_palette', reply: isZh ? '已打开全局命令面板。' : 'Opening Command Palette.' };
  }
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

  // 7. Globe Fly-To Destinations
  if (/带我去|飞到|飞往|定位到|去看看/.test(raw)) {
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

  // 8. Full-Website Module Navigation
  const navRules: Array<{ test: RegExp; tab: string; zh: string; en: string }> = [
    { test: /多邻国|多林国|语言学习|学英语|学语言|英语引擎|阿拉伯语|duolingo|arabic|english learning|language center/i, tab: 'arabic-learning', zh: '语言学习中心', en: 'Language Center' },
    { test: /通话中心|打个电话|语音通话|视频通话|call center/i, tab: 'chat', zh: '信息与通话', en: 'Messages & Calls' },
    { test: /信息与通话|打开信息|打开消息|发消息|通话|私信|chat|messenger|messages/i, tab: 'chat', zh: '信息与通话', en: 'Messages' },
    { test: /发现|动态|广场|feed|discover/i, tab: 'feed', zh: '发现动态', en: 'Discover' },
    { test: /音乐馆|音乐空间|音乐中心|打开音乐|music/i, tab: 'venus', zh: '音乐空间', en: 'Music Space' },
    { test: /影视中心|视频中心/i, tab: 'video', zh: '影视视频中心', en: 'Video Center' },
    { test: /图书馆|看书|读书|library/i, tab: 'library', zh: '世界数字图书馆', en: 'Digital Library' },
    { test: /宇宙|星空|太阳系|universe/i, tab: 'universe', zh: '3D 宇宙引擎', en: 'Universe Engine' },
    { test: /月球学院|太空学院|academy/i, tab: 'academy', zh: '月球学院', en: 'Moon Academy' },
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
    { test: /回到首页|打开首页|回首页|主页|地球|回到桌面|home|globe/i, tab: 'globe', zh: '首页', en: 'Home' },
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

export function resolveConversationalFallback(text: string, isZh: boolean, errorHint?: string): string {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (/^(你好|您好|哈喽|嗨|在吗|在不在|hi|hello|hey)/i.test(raw)) {
    return isZh
      ? '我在呢。你可以随时说话或打断我，让我放歌、看纪录片、飞往任何城市、启动游戏或操作整个网站。'
      : 'I am listening. Speak or interrupt me anytime to play music, open any space, launch a game, or fly the globe.';
  }
  if (/你是谁|你叫什么|who are you|what is your name/i.test(raw)) {
    return isZh
      ? '我是 One.，由 Gemini 实时语音与多模态引擎驱动的全站智能总控，能听懂你的每一句话并操作整个 EARTH ONE。'
      : 'I am One., your Gemini-powered full-duplex voice agent controlling the entire EARTH ONE platform.';
  }
  if (/你能干什么|你能做什么|有什么功能|怎么用|help|what can you do/i.test(raw)) {
    return isZh
      ? '你可以直接对我说：带我去巴黎、放一首钢琴曲、打开五子棋、搜索宇宙纪录片、切换深色模式，或让我发一条动态。'
      : 'Ask me to fly to Paris, play piano music, launch Gomoku, watch a space documentary, or switch to dark mode.';
  }
  if (/几点|时间|what time/i.test(raw)) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return isZh ? `现在是 ${hh} 点 ${mm} 分。` : `It is ${hh}:${mm} right now.`;
  }
  if (/几号|星期几|今天日期|what day|date/i.test(raw)) {
    const now = new Date();
    return isZh
      ? `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日。`
      : `Today is ${now.toDateString()}.`;
  }
  if (/谢谢|感谢|thanks|thank you/i.test(lower)) {
    return isZh ? '不客气，随时叫我。' : 'You are welcome!';
  }
  if (errorHint && /API Key|密钥|configured|401|503/i.test(errorHint)) {
    return isZh
      ? '云端问答密钥尚未就绪，但所有全站控制指令（放歌、跳转页面、地球飞行、游戏启动、主题切换）都可随时直接语音触发。'
      : 'Cloud chat key is not configured yet, though all site voice controls work immediately.';
  }
  return isZh
    ? '我刚才没有连上云端问答服务；你可以直接让我切换任何星球页面、放歌、找纪录片或启动游戏。'
    : 'I could not reach the cloud chat service just now, though you can still command any site action.';
}

export async function resolveNaturalAgentAction(
  text: string,
  isZh: boolean,
  context?: Record<string, unknown>
): Promise<OneAgentAction> {
  const instant = parseInstantAgentAction(text, isZh);
  if (instant) return instant;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    const res = await fetch('/api/ai/agent-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: isZh ? 'zh' : 'en', context }),
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
