import { Type, type FunctionDeclaration } from '@google/genai';

export const VALID_TABS = [
  'globe',
  'universe',
  'feed',
  'chat',
  'venus',
  'saturn',
  'video',
  'library',
  'arabic-learning',
  'knowledge',
  'browser',
  'aihub',
  'moon',
  'academy',
  'mercury',
  'crawler',
  'network',
  'community',
  'creator',
  'game',
  'brand',
] as const;

export const ONE_SITE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'navigate_tab',
    description:
      'Switch the EARTH ONE web application to any page or planetary ecosystem module. Use this whenever the user asks to open, go to, enter, or view any section of the website.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          description:
            'Target module tab ID. One of: globe (首页/3D地球), universe (3D太阳系宇宙引擎), feed (发现动态/全球广场), chat (信息与通话), venus (金星音乐馆), saturn (土星影视/纪录片影院), video (视频中心), library (世界数字图书馆), arabic-learning (多邻国/英语与阿拉伯语学习中心), knowledge (全域知识图谱), browser (木星宇宙浏览器), aihub (天王星AI智能中枢), moon (月球深空天文台), academy (月球学院), mercury (水星全网索引搜索), crawler (采集网络中枢), network (ONE网络节点/代理), community (数字社区), creator (海王星创作者中心), game (火星游戏宇宙), brand (独一ONE品牌系统).',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'fly_to_location',
    description:
      'Fly the 3D Digital Globe camera to any city, landmark, or country coordinates on Earth.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        lat: { type: Type.NUMBER, description: 'Latitude in decimal degrees (-90 to 90).' },
        lng: { type: Type.NUMBER, description: 'Longitude in decimal degrees (-180 to 180).' },
        placeName: { type: Type.STRING, description: 'Human-readable city or country name.' },
      },
      required: ['lat', 'lng', 'placeName'],
    },
  },
  {
    name: 'control_music',
    description:
      'Control music playback across the entire EARTH ONE site (play a song/genre/mood via crawler, pause, stop, resume, next track, or previous track).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        control: {
          type: Type.STRING,
          description: 'Action: play_query, pause, stop, resume, next, prev.',
        },
        query: {
          type: Type.STRING,
          description: 'Optional song title, artist, or mood/genre (e.g. piano, ambient, lofi, 周杰伦) when control is play_query.',
        },
      },
      required: ['control'],
    },
  },
  {
    name: 'watch_cinema',
    description:
      'Open Saturn Cinema Universe and search or auto-play a documentary, movie, or video topic.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keywords for the documentary, film, or topic.',
        },
        platform: {
          type: Type.STRING,
          description: 'Optional video source: all, bilibili, or youtube.',
        },
        randomPick: {
          type: Type.BOOLEAN,
          description: 'Whether to auto-pick and start playing a matching title.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_action',
    description:
      'Open the built-in Cosmic Web Browser (Jupiter) and search the web or navigate directly to a URL.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        queryOrUrl: {
          type: Type.STRING,
          description: 'Web search query or full URL (https://...) to open inside Cosmic Browser.',
        },
      },
      required: ['queryOrUrl'],
    },
  },
  {
    name: 'search_global_index',
    description:
      'Open Mercury Global Search and search across EARTH ONE books, knowledge graph, users, communities, posts, and videos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Keywords to search in the EARTH ONE global index.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_game',
    description:
      'Open Mars Game Center and launch a specific game directly.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        game: {
          type: Type.STRING,
          description: 'Game ID: flight (3D太空飞行), gravity (引力沙盒), chess (太空国际象棋), gomoku (五子棋), trivia (全球知识问答).',
        },
      },
      required: ['game'],
    },
  },
  {
    name: 'open_messenger_or_call',
    description:
      'Open Global Messenger, jump to the Call Center, or initiate an audio/video call.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: open_chat, open_calls, start_audio_call, start_video_call.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'publish_global_post',
    description:
      'Publish a new social post to the EARTH ONE Global Feed on behalf of the user when explicitly asked to post/publish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: 'Text content of the post.' },
        category: {
          type: Type.STRING,
          description: 'Post category: thought, culture, tech, nature, or art.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'set_site_preferences',
    description:
      'Change UI theme (dark/light), interface language (zh/en), toggle immersive 3D globe mode, open Command Palette, or replay the cinematic intro.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: { type: Type.STRING, description: 'Optional: dark or light.' },
        lang: { type: Type.STRING, description: 'Optional: zh or en.' },
        immersive: { type: Type.BOOLEAN, description: 'Optional: enable or exit immersive mode on 3D Globe.' },
        openCommandPalette: { type: Type.BOOLEAN, description: 'Optional: open the global Cmd+K command palette.' },
        replayIntro: { type: Type.BOOLEAN, description: 'Optional: replay the cinematic intro sequence.' },
      },
    },
  },
  {
    name: 'get_current_site_context',
    description:
      'Inspect the user’s current live EARTH ONE website state (active page/tab, theme, language, playing track, logged-in user) before answering questions about what is currently on screen.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

export function buildLiveCompanionInstruction(lang: 'zh' | 'en', siteContext?: Record<string, unknown>): string {
  const ctxText = siteContext ? JSON.stringify(siteContext) : '{}';
  return [
    '你是 One.，EARTH ONE 的低延迟实时语音与全站控制助手（后端 Gemini）。',
    '规则：',
    '1. 口语简短回复（1~2句，禁Markdown/长段落），支持随时打断并立刻响应新指令。',
    '2. 操作网站（切页面、飞往地点、放歌/停歌/切歌、看片、搜网、玩游戏、通话、发帖、改主题/语言、看当前状态）立刻调用对应工具并用一句简短口语确认；日常问答直接回答。',
    `3. 状态:${ctxText} | 默认语言:${lang === 'zh' ? '中文' : 'English'}（随用户语种切换）。`,
  ].join('\n');
}
