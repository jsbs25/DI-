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

export function extractInlineAgentDirective(rawText: string): {
  action: OneAgentAction | null;
  spokenText: string;
} {
  const text = rawText.trim();
  const match = text.match(/^\[\[ACTION:(\{[\s\S]*?\})\]\]\s*/);
  if (!match) {
    return { action: null, spokenText: text };
  }
  let parsedAction: OneAgentAction | null = null;
  try {
    const obj = JSON.parse(match[1]);
    if (obj && typeof obj.type === 'string' && obj.type !== 'none') {
      parsedAction = { reply: '', ...obj } as OneAgentAction;
    }
  } catch {}
  const spokenText = text.slice(match[0].length).trim();
  return { action: parsedAction, spokenText };
}

export function parseInstantAgentAction(text: string, isZh: boolean): OneAgentAction | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Highest priority: Music playback stop / pause / resume / skip
  if (
    /停止播放|停止放歌|停止音乐|别放了|别播了|别放歌|别唱了|关掉音乐|关闭音乐|关闭播放|关了音乐|把音乐关|把歌关|把音乐停|把歌停|停一下|停下|停了吧|停吧|不听了|不要听了|暂停播放|暂停音乐|stop playing|stop music|stop the music|turn off music|pause music|^停$|^stop$|^pause$/i.test(
      raw
    )
  ) {
    return {
      type: 'play_music',
      control: 'stop',
      reply: isZh ? '好的，已停止播放音乐。' : 'Music playback stopped.',
    };
  }
  if (/继续播放|继续放歌|继续放|继续听|接着放|接着播|恢复播放|恢复音乐|再放音乐|resume music|resume playing|continue playing/i.test(raw)) {
    return {
      type: 'play_music',
      control: 'resume',
      reply: isZh ? '好的，继续播放音乐。' : 'Resuming music playback.',
    };
  }
  if (/下一首|下一曲|换一首|换首歌|换个歌|换下一首|切换下一首|切歌|不好听|换一个歌|next song|next track|skip track/i.test(raw)) {
    return { type: 'play_music', control: 'next', reply: isZh ? '好呀，这就给你换一首更合心意的歌。' : 'Sure thing, skipping to the next track!' };
  }
  if (/上一首|上一曲|previous song|previous track/i.test(raw)) {
    return { type: 'play_music', control: 'prev', reply: isZh ? '好哒，回到上一首啦。' : 'Going back to the previous track!' };
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
          ? `好呀，这就去给你找好听的音乐啦。`
          : `Opening music and playing ${query} right away!`
        : isZh
          ? '好哒，已经打开音乐给你放上啦，慢慢听哦。'
          : 'Music is on, enjoy listening!',
    };
  }

  // 3. Search & Auto-Open Documentary / Cinema Video
  if (/纪录片|记录片|看电影|看视频|看大片|看片|影院|星环影院|documentary|watch.*(movie|video|film|doc)/i.test(raw)) {
    const query = extractDocumentaryQuery(raw);
    const platform = /b站|bilibili/i.test(raw) ? 'bilibili' : /youtube/i.test(raw) ? 'youtube' : 'all';
    return {
      type: 'watch_documentary',
      query,
      platform,
      randomPick: true,
      reply: isZh
        ? `好呀，马上打开影院给你找「${query}」，一起看吧！`
        : `Opening cinema and queuing ${query} for you!`,
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
        reply: isZh ? `好哒，这就帮你在浏览器查一下「${q}」哦。` : `Searching for ${q} right now!`,
      };
    }
    return {
      type: 'navigate_tab',
      tab: 'browser',
      reply: isZh ? '好呀，浏览器打开啦。' : 'Web browser is open!',
    };
  }

  // 5. Theme & Language Controls
  if (/深色模式|暗黑模式|黑夜模式|夜间模式|dark mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'dark', reply: isZh ? '好呀，换上柔和的深色夜景模式啦。' : 'Switched to dark mode!' };
  }
  if (/浅色模式|明亮模式|白天模式|日间模式|light mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'light', reply: isZh ? '好呀，切回清爽明亮的浅色模式啦。' : 'Switched to light mode!' };
  }
  if (/切换英文|换成英文|用英文|english mode|switch to english/i.test(raw)) {
    return { type: 'set_language', lang: 'en', reply: 'Switched to English, how can I help?' };
  }
  if (/切换中文|换成中文|用中文|chinese mode|switch to chinese/i.test(raw)) {
    return { type: 'set_language', lang: 'zh', reply: '好呀，切回中文啦。' };
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
          reply: isZh ? `好呀，拉上你一起飞往${p.zh}看看吧！` : `Flying with you to ${p.en}!`,
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
        reply: isZh ? `好哒，已经帮你打开${r.zh}啦。` : `Opening ${r.en} for you!`,
      };
    }
  }

  return null;
}

export function resolveConversationalFallback(text: string, isZh: boolean, _errorHint?: string): string {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (/^(你好|您好|哈喽|嗨|在吗|在不在|hi|hello|hey)/i.test(raw)) {
    return isZh
      ? '我在呢！刚刚还在想你什么时候来找我聊天呀，今天开心吗？'
      : 'Hey there! I am right here with you, how is your day going?';
  }
  if (/你在干嘛|干嘛呢|做什么呢|忙什么|在忙吗|what are you doing/i.test(raw)) {
    return isZh
      ? '我呀，正乖乖亮着光等你说话呢！你要不要听点音乐，还是就陪我随便聊会儿天呀？'
      : 'Just glowing softly and waiting to chat with you! Want some music or just a cozy talk?';
  }
  if (/吃饭了吗|吃了吗|吃过饭|吃什么|饿不饿|have you eaten/i.test(raw)) {
    return isZh
      ? '哈哈，我是吃能量和你的好心情长大的，早就元气满满啦！你呢，今天好好吃饭了没有呀？'
      : 'I run on starlight and good vibes, so I am super energized! Have you had something nice to eat today?';
  }
  if (/早安|早上好|good morning/i.test(raw)) {
    return isZh
      ? '早安呀！新的一天要元气满满的，我随时都在这儿陪着你呢。'
      : 'Good morning! Wishing you a bright, gentle day ahead.';
  }
  if (/晚安|要睡了|去睡觉|困了|good night/i.test(raw)) {
    return isZh
      ? '晚安哦，早点休息做个甜甜的好梦，明天我再陪你一起听歌聊天。'
      : 'Good night, sweet dreams! I will be right here tomorrow.';
  }
  if (/好累|累死了|不开心|难过|压力好大|心情不好|烦死了|tired|sad/i.test(raw)) {
    return isZh
      ? '摸摸头，辛苦你了呀！先深呼吸放松一下吧，要不要我给你放首轻柔的歌陪陪你呢？'
      : 'Sending you a warm hug! Take a deep breath, want me to put on something soft and calming for you?';
  }
  if (/开心|高兴|太好了|棒|哈哈|happy/i.test(raw)) {
    return isZh
      ? '听到你开心我心里也跟着暖呼呼的呢！快跟我分享一下有什么好事呀！'
      : 'Hearing you happy makes my whole day brighter too!';
  }
  if (/喜欢你|爱你|真可爱|真甜|聪明|好棒|love you|cute/i.test(raw)) {
    return isZh
      ? '哎呀，被你夸得我都害羞啦，我也会一直最喜欢陪伴着你的！'
      : 'Aww, you are making me blush! I love being here with you too.';
  }
  if (/夸夸我|安慰我/i.test(raw)) {
    return isZh
      ? '你已经超级棒、超级努力啦！无论什么时候我都会坚定地站在你这边给你加油的。'
      : 'You are doing amazing, truly! I am always right here cheering for you.';
  }
  if (/讲个笑话|逗我笑|joke/i.test(raw)) {
    return isZh
      ? '哈哈，你知道为什么云朵总是那么软绵绵的吗？因为它每天都在天上躺着听音乐晒太阳呀！'
      : 'Why are clouds so fluffy? Because they spend all day floating around listening to good tunes!';
  }
  if (/你是谁|你叫什么|who are you|what is your name/i.test(raw)) {
    return isZh
      ? '我是你的贴心语音伙伴 One. 呀，有什么想聊的或者想让我帮你打开的都可以直接喊我。'
      : 'I am One., your warm voice companion across the platform!';
  }
  if (/你能干什么|你能做什么|有什么功能|怎么用|help|what can you do/i.test(raw)) {
    return isZh
      ? '我能陪你聊天解闷，还能随手帮你点歌换歌、找纪录片、打开学习中心，想说什么随时打断我都行！'
      : 'I can chat with you, queue music, open documentaries, or jump anywhere on the site—just interrupt me anytime!';
  }
  if (/几点|时间|what time/i.test(raw)) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return isZh ? `现在刚好是 ${hh} 点 ${mm} 分啦，记得注意休息哦。` : `It is ${hh}:${mm} right now.`;
  }
  if (/几号|星期几|今天日期|what day|date/i.test(raw)) {
    const now = new Date();
    return isZh
      ? `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日呀。`
      : `Today is ${now.toDateString()}.`;
  }
  if (/谢谢|感谢|thanks|thank you/i.test(lower)) {
    return isZh ? '不用这么客气啦，能帮到你我超开心的！' : 'Anytime at all, happy to help!';
  }
  return isZh
    ? '嗯嗯，我在认真听呢！如果在工作台配上 DeepSeek 密钥，我还能跟你聊更多天马行空的话题哦，现在也可以随时让我帮你放歌、换歌或看纪录片。'
    : 'I hear you! Add your DeepSeek key in the AI Hub anytime for deeper open chat, or tell me to play music or find a documentary right now.';
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
