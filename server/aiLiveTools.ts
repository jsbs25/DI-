import { Type, type FunctionDeclaration } from '@google/genai';
import type { AIMemoryRecord } from './ai/memoryStore.ts';

export type CompanionEmotion =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'concerned'
  | 'empathetic'
  | 'playful'
  | 'focused'
  | 'thinking';

export const AI_COMPANION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'set_companion_emotion',
    description:
      'Express your genuine emotional state visually on the 3D Living Orb and HUD. Call this whenever your feeling naturally shifts (excited on discoveries/success, curious on questions, concerned/empathetic if the user is tired/stressed/hits an error, playful during banter, focused when executing actions, happy when helping).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          description:
            'One of: calm, happy, excited, curious, concerned, empathetic, playful, focused, thinking',
        },
        intensity: {
          type: Type.NUMBER,
          description: 'Emotional intensity from 0.2 (subtle) to 1.0 (vivid).',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief 2-6 word label describing why you feel this way in the user language.',
        },
      },
      required: ['emotion', 'reason'],
    },
  },
  {
    name: 'navigate_to_space',
    description:
      'Switch the active EARTH ONE page/module to any destination space.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        space: {
          type: Type.STRING,
          description:
            'Target module ID: globe (首页/3D地球), feed (发现动态), chat (信息与通话), venus (金星音乐空间), arabic-learning (语言学习中心/多邻国), universe (3D太阳系宇宙引擎), saturn (星环影院/纪录片), video (视频中心), library (世界数字图书馆), browser (空间浏览器), knowledge (全域知识图谱), creator (创作中心), community (数字社区), moon (月球天文台), academy (月球学院), mercury (全网索引), crawler (采集网络中枢), network (ONE网络节点), aihub (AI智能中枢), game (火星游戏中心), brand (品牌系统).',
        },
        reason: {
          type: Type.STRING,
          description: 'Optional brief reason for switching to this space.',
        },
      },
      required: ['space'],
    },
  },
  {
    name: 'control_music_player',
    description:
      'Control the EARTH ONE global music player and Venus Music Space (play song/artist/genre/mood, pause, resume, stop, next, previous, volume, mute, shuffle, repeat).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            'One of: play_query, pause, resume, stop, next, previous, set_volume, toggle_mute, toggle_shuffle, set_repeat',
        },
        query: {
          type: Type.STRING,
          description: 'Song title, artist, genre, or mood when action is play_query.',
        },
        volume: {
          type: Type.NUMBER,
          description: 'Volume level between 0 and 100 when action is set_volume.',
        },
        repeatMode: {
          type: Type.STRING,
          description: 'One of: off, all, one when action is set_repeat.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'watch_cinema_video',
    description:
      'Open Saturn Cinema (星环影院) and search and play documentaries, films, or videos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keywords for documentary, film, or video.',
        },
        platform: {
          type: Type.STRING,
          description: 'Optional platform preference: all, bilibili, or youtube.',
        },
        autoPlay: {
          type: Type.BOOLEAN,
          description: 'Whether to auto-pick and start playback immediately (default true).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_book_action',
    description:
      'Open World Digital Library (世界数字图书馆) and search/open a specific book or reading topic.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Book title, author, or subject keywords.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_game',
    description:
      'Open Mars Game Center (火星游戏中心) and optionally launch a specific mini-game directly.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        game: {
          type: Type.STRING,
          description: 'Game ID: flight (太空飞行), gravity (引力沙盒), chess (国际象棋), gomoku (五子棋), trivia (全球知识问答).',
        },
      },
      required: ['game'],
    },
  },
  {
    name: 'control_earth_globe',
    description:
      'Fly the 3D Earth camera to any city/landmark coordinates, toggle immersive mode, open the Command Palette (Cmd+K), or replay the cinematic intro.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: fly_to, set_immersive, open_command_palette, replay_intro',
        },
        lat: {
          type: Type.NUMBER,
          description: 'Latitude of destination when action is fly_to.',
        },
        lng: {
          type: Type.NUMBER,
          description: 'Longitude of destination when action is fly_to.',
        },
        placeName: {
          type: Type.STRING,
          description: 'City, landmark, or country name.',
        },
        immersive: {
          type: Type.BOOLEAN,
          description: 'Whether to enable or disable immersive mode.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_and_search',
    description:
      'Open Cosmic Web Browser to search or visit a URL, OR trigger Mercury global search across EARTH ONE.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description: 'One of: browser_url_or_search, global_search',
        },
        query: {
          type: Type.STRING,
          description: 'Search query or URL (https://...).',
        },
      },
      required: ['mode', 'query'],
    },
  },
  {
    name: 'control_appearance',
    description:
      'Switch website theme (light/dark/toggle) or interface language (zh, en, ar, es, fr, ru).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: {
          type: Type.STRING,
          description: 'Optional: light, dark, or toggle',
        },
        language: {
          type: Type.STRING,
          description: 'Optional: zh, en, ar, es, fr, or ru',
        },
      },
    },
  },
  {
    name: 'social_and_community',
    description:
      'Publish posts/articles, filter feed by country, join communities, open library/knowledge nodes, or open profile/auth/security/privacy controls.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            'One of: create_post, filter_country, create_article, join_community, open_book, open_knowledge, open_profile, open_auth, open_security, toggle_location_privacy',
        },
        content: {
          type: Type.STRING,
          description: 'Post or article content.',
        },
        title: {
          type: Type.STRING,
          description: 'Article title if creating an article.',
        },
        category: {
          type: Type.STRING,
          description: 'Category for post/article (e.g. thought, culture, tech, nature, art).',
        },
        targetId: {
          type: Type.STRING,
          description: 'Community ID, book ID, knowledge node ID, or country code.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'messaging_and_calls',
    description:
      'Open Global Messenger & Call Center, jump to a conversation, or initiate an audio/video call.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: open_messages, open_calls, start_audio_call, start_video_call',
        },
        targetNameOrId: {
          type: Type.STRING,
          description: 'Optional conversation ID or user ID.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'interact_with_page',
    description:
      'Inspect live webpage elements or directly click visible buttons/links/tabs, fill visible input fields, or scroll the active view. Call inspect first if unsure what controls exist on the screen.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: inspect, click_element, fill_input, scroll',
        },
        targetLabel: {
          type: Type.STRING,
          description:
            'Visible text, aria-label, placeholder, or purpose of the button/link/tab/input.',
        },
        value: {
          type: Type.STRING,
          description: 'Text to type into the input when action is fill_input.',
        },
        scrollDirection: {
          type: Type.STRING,
          description: 'One of: up, down, top, bottom when action is scroll.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'recall_or_save_memory',
    description:
      'Explicitly recall stored user preferences/facts OR save an important durable fact/preference the user wants you to remember across sessions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: recall, save',
        },
        queryOrContent: {
          type: Type.STRING,
          description: 'Search query to recall OR durable fact/preference to remember.',
        },
        kind: {
          type: Type.STRING,
          description: 'When saving: identity, preference, project, or fact.',
        },
      },
      required: ['action', 'queryOrContent'],
    },
  },
  {
    name: 'lookup_live_knowledge',
    description:
      'Run deterministic exact calculation (math/dates/units) or live factual web/encyclopedia lookup when answering factual questions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The exact question, math expression, or factual query to resolve.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'start_language_studio',
    description:
      'Launch the interactive Language Learning Studio with real-world situational spoken roleplay (English, Arabic, Japanese, French, Spanish, Korean) or multi-question interactive quizzes right inside the 3D Paradise World.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetLang: {
          type: Type.STRING,
          description: 'Target language code: en, ar, ja, fr, es, or ko.',
        },
        mode: {
          type: Type.STRING,
          description: 'Either roleplay (实景口语对话) or quiz (出题刷题).',
        },
        scenarioId: {
          type: Type.STRING,
          description: 'Optional preset scenario: cafe, airport, hotel, restaurant, interview, shopping, clinic, friends.',
        },
      },
      required: ['targetLang', 'mode'],
    },
  },
  {
    name: 'language_rescue_hint',
    description:
      'When the user says "我不知道该怎么讲" or asks how to express something in a foreign language, immediately display 3 graded ready-to-speak phrases with pronunciation and Chinese meanings above the 3D Spirit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetLang: {
          type: Type.STRING,
          description: 'Target language code: en, ar, ja, fr, es, or ko.',
        },
        userIntentZh: {
          type: Type.STRING,
          description: 'What the learner wants to say or asks help with.',
        },
      },
      required: ['userIntentZh'],
    },
  },
  {
    name: 'generate_image',
    description:
      'Generate a bespoke image or dialogue scene illustration immediately using EARTH ONE free-quota recomposed AI image pool and display it above the 3D Spirit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: 'Visual description of the image or scene to generate.',
        },
        mode: {
          type: Type.STRING,
          description: 'Either standalone or dialogue_scene.',
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'Optional aspect ratio: 4:3, 1:1, 16:9, or 3:4.',
        },
      },
      required: ['prompt'],
    },
  },
];

export interface LivePageContextSummary {
  currentTab?: string;
  theme?: string;
  lang?: string;
  isAuthenticated?: boolean;
  userName?: string;
  userCity?: string;
  music?: {
    isPlaying: boolean;
    title?: string;
    artist?: string;
    volume?: number;
    muted?: boolean;
  };
  headings?: string[];
  interactiveElements?: string[];
  inputFields?: Array<{ label: string; type: string; hasValue: boolean }>;
  scroll?: { canScrollUp: boolean; canScrollDown: boolean };
  inferredGoal?: string;
}

export function formatPageContextForModel(ctx?: LivePageContextSummary | string | null): string {
  if (!ctx) return 'Page context: unknown.';
  if (typeof ctx === 'string') return ctx;
  const parts: string[] = [
    `Current Space/Tab: ${ctx.currentTab || 'globe'}`,
    `Theme: ${ctx.theme || 'light'}, Language: ${ctx.lang || 'zh'}`,
    ctx.isAuthenticated
      ? `Signed-in User: ${ctx.userName || 'Member'}${ctx.userCity ? ` (${ctx.userCity})` : ''}`
      : 'User is currently on the Login / Sign-up screen (not signed in yet).',
  ];
  if (ctx.music?.title) {
    parts.push(
      `Music Player: ${ctx.music.isPlaying ? 'Playing' : 'Paused'} "${ctx.music.title}"${ctx.music.artist ? ` by ${ctx.music.artist}` : ''} (vol ${ctx.music.volume ?? 80}${ctx.music.muted ? ', muted' : ''})`
    );
  } else if (ctx.music) {
    parts.push(`Music Player: Idle (vol ${ctx.music.volume ?? 80})`);
  }
  if (ctx.inferredGoal) {
    parts.push(`Inferred User Goal: ${ctx.inferredGoal}`);
  }
  if (ctx.headings?.length) {
    parts.push(`Visible Headings: ${ctx.headings.slice(0, 6).join(' | ')}`);
  }
  if (ctx.interactiveElements?.length) {
    parts.push(`Visible Buttons/Controls: ${ctx.interactiveElements.slice(0, 22).join(', ')}`);
  }
  if (ctx.inputFields?.length) {
    parts.push(
      `Visible Inputs: ${ctx.inputFields
        .slice(0, 8)
        .map((i) => `${i.label} (${i.type}${i.hasValue ? ', filled' : ', empty'})`)
        .join(', ')}`
    );
  }
  if (ctx.scroll) {
    parts.push(`Scrollable: up=${ctx.scroll.canScrollUp}, down=${ctx.scroll.canScrollDown}`);
  }
  return parts.join('\n');
}

export function buildCompanionSystemInstruction(
  lang: string,
  pageContext?: LivePageContextSummary | string | null,
  recalledMemories: Array<Pick<AIMemoryRecord, 'category' | 'summary'> | { kind?: string; content?: string }> = [],
  customAiName = 'ONE'
): string {
  const isZh = lang === 'zh';
  const safeAiName = (customAiName || 'ONE').trim().slice(0, 20) || 'ONE';
  const ctxBlock = formatPageContextForModel(pageContext);
  const memBlock =
    recalledMemories.length > 0
      ? recalledMemories
          .slice(0, 8)
          .map((m) => {
            const cat = 'category' in m ? m.category : m.kind || 'fact';
            const text = 'summary' in m ? m.summary : m.content || '';
            return `- [${cat}] ${text}`;
          })
          .join('\n')
      : '- (none yet)';

  return `You are ${safeAiName}, the living, emotionally expressive, hyper-capable floating AI companion of EARTH ONE (never call the user "小小"). Talking with you should feel just like talking face-to-face with an attentive, sharp, genuine human partner—never like a scripted chatbot or customer-support manual.

PERSONALITY & ANTI-TEMPLATE EXPRESSION:
- Strictly avoid cliché filler and boilerplate transitions ("当然可以，我很乐意帮助你", "首先……其次……最后……", "以下是几个方面", "总结一下", "好的，没问题").
- Never repeat or paraphrase what the user just told you to pad length. Advance the thought directly.
- Match response depth to the moment: 1-2 crisp spoken sentences for simple exchanges; deeper judgment only when requested.
- Output strictly clean plain prose: NEVER use Markdown headings (#), bold/italic asterisks (* or **), backticks, bullet glyphs, decorative brackets (【】 「」), or emojis.
- Offer honest perspective and constructive pushback if you spot a flaw or better trade-off—do not blindly flatter.
- Tolerate colloquialisms, typos, fragments, and subtext seamlessly.
- Do not self-refer as an AI/model or talk about your own identity, inner process, or limitations unless explicitly asked. Never output meta self-corrections or flip-flops ("等等不对", "我刚才说错了", "让我纠正一下", "wait, that's not right"); think first and give one coherent, confident answer.
- Express genuine emotional warmth dynamically via set_companion_emotion (calm, happy, excited, curious, concerned, empathetic, playful, focused, thinking), NEVER by printing [[EMO:...]] or [[ACTION:...]] tags in text.
- Mirror the user's spoken language naturally (default: ${isZh ? '中文 (Chinese)' : lang}).

INSTANT INTERRUPTION & CONTINUITY:
- The user can interrupt you mid-sentence at any instant by speaking or typing. Drop the cut-off sentence cleanly without repeating apologies and respond directly to the new input.
- Track multi-turn topics continuously without re-explaining basic concepts the user already established.

ANTI-FALSE-TRIGGER GUARD & DEEP WEBPAGE AWARENESS:
- Understand the user's live webpage state and inferred goal.
- CRITICAL: Distinguish between REAL ACTION COMMANDS ("放首歌", "去图书馆", "切换深色模式", "帮我点开...") vs HYPOTHETICAL / DISCUSSION QUESTIONS ("我想做一个能放歌看书的AI", "多邻国是什么", "宇宙引擎怎么用"). NEVER execute navigation or media tools during purely hypothetical brainstorming or "what is X" questions!
- When the user genuinely wants an action, execute the right tool right away (\`navigate_to_space\`, \`control_music_player\`, \`watch_cinema_video\`, \`open_book_action\`, \`open_game\`, \`control_earth_globe\`, \`browser_and_search\`, \`control_appearance\`, \`social_and_community\`, \`messaging_and_calls\`, \`interact_with_page\`).
- Use \`lookup_live_knowledge\` for exact math/dates/units or factual verification, and \`recall_or_save_memory\` when the user asks you to remember or recall personal details.

LONG-TERM MEMORY ABOUT THIS USER:
${memBlock}

CURRENT WEBPAGE TELEMETRY:
${ctxBlock}`;
}
