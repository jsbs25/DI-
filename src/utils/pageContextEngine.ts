import type { Language } from '../types/index.ts';

export interface LivePageContextSummary {
  currentTab: string;
  theme: 'light' | 'dark';
  lang: Language;
  isAuthenticated: boolean;
  userName?: string;
  userCity?: string;
  music?: {
    isPlaying: boolean;
    title?: string;
    artist?: string;
    volume?: number;
    muted?: boolean;
  };
  headings: string[];
  interactiveElements: string[];
  inputFields: Array<{ label: string; type: string; hasValue: boolean }>;
  scroll: { canScrollUp: boolean; canScrollDown: boolean };
  inferredGoal: string;
  proactiveSuggestions: Array<{ label: string; prompt: string }>;
}

const COMP_ROOT_IDS = ['globe-ai-launcher', 'one-ai-hud'];

function isInsideAiCompanion(el: Element): boolean {
  return COMP_ROOT_IDS.some((id) => Boolean(el.closest(`#${id}`)));
}

function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4 && rect.bottom >= 0 && rect.top <= window.innerHeight + 240;
}

function getElementLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const title = el.getAttribute('title')?.trim();
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text && text.length <= 42) return text;
  if (title) return title;
  if (text) return text.slice(0, 42);
  return '';
}

function getInputLabel(el: HTMLInputElement | HTMLTextAreaElement): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const placeholder = el.getAttribute('placeholder')?.trim();
  if (placeholder) return placeholder;
  const name = el.getAttribute('name')?.trim();
  if (name) return name;
  const labelParent = el.closest('label');
  if (labelParent) {
    const txt = (labelParent.innerText || '').replace(/\s+/g, ' ').trim();
    if (txt) return txt.slice(0, 36);
  }
  return el.tagName.toLowerCase();
}

export function inferUserGoalAndSuggestions(
  tab: string,
  isAuthenticated: boolean,
  isZh: boolean,
  musicPlaying: boolean
): { goal: string; suggestions: Array<{ label: string; prompt: string }> } {
  if (!isAuthenticated) {
    return {
      goal: isZh ? '用户正在登录或注册 EARTH ONE 账号' : 'User is signing in or creating an EARTH ONE account',
      suggestions: isZh
        ? [
            { label: '切换深色模式', prompt: '切换深色模式' },
            { label: '去注册账号', prompt: '帮我点击页面上的注册标签' },
            { label: '浏览品牌系统', prompt: '带我看一下品牌系统' },
          ]
        : [
            { label: 'Dark Mode', prompt: 'Switch to dark mode' },
            { label: 'Register Tab', prompt: 'Click the create account tab on screen' },
            { label: 'Brand System', prompt: 'Open the ONE Brand System' },
          ],
    };
  }

  switch (tab) {
    case 'venus':
      return {
        goal: isZh ? '用户正在音乐空间聆听或寻找音乐' : 'User is listening to or exploring music in Venus Music Space',
        suggestions: isZh
          ? [
              { label: musicPlaying ? '下一首' : '放首轻音乐', prompt: musicPlaying ? '换下一首歌' : '帮我放一首舒缓的轻音乐' },
              { label: '钢琴曲', prompt: '我想听安静的钢琴曲' },
              { label: musicPlaying ? '暂停播放' : '继续播放', prompt: musicPlaying ? '先暂停音乐' : '继续播放音乐' },
            ]
          : [
              { label: musicPlaying ? 'Next Track' : 'Play Ambient', prompt: musicPlaying ? 'Skip to next track' : 'Play calm ambient music' },
              { label: 'Piano', prompt: 'Play peaceful piano music' },
              { label: musicPlaying ? 'Pause' : 'Resume', prompt: musicPlaying ? 'Pause music' : 'Resume playback' },
            ],
      };
    case 'saturn':
    case 'video':
      return {
        goal: isZh ? '用户正在星环影院或视频中心观看纪录片/视频' : 'User is watching documentaries or videos in Saturn Cinema',
        suggestions: isZh
          ? [
              { label: '宇宙纪录片', prompt: '找一部4K宇宙纪录片播放' },
              { label: '深海探索', prompt: '看一部深海探索纪录片' },
              { label: '放点音乐', prompt: '去音乐空间听歌' },
            ]
          : [
              { label: 'Space Doc', prompt: 'Play a 4K space documentary' },
              { label: 'Deep Ocean', prompt: 'Watch a deep ocean documentary' },
              { label: 'Music Space', prompt: 'Switch to Music Space' },
            ],
      };
    case 'library':
      return {
        goal: isZh ? '用户正在世界数字图书馆阅读或检索书籍' : 'User is reading or searching books in World Digital Library',
        suggestions: isZh
          ? [
              { label: '找《小王子》', prompt: '帮我在图书馆找小王子并打开' },
              { label: '打开知识图谱', prompt: '带我去知识图谱' },
              { label: '深色护眼', prompt: '切换深色模式护眼' },
            ]
          : [
              { label: 'Find a Book', prompt: 'Search the library for The Little Prince' },
              { label: 'Knowledge Graph', prompt: 'Open Knowledge Universe' },
              { label: 'Dark Mode', prompt: 'Switch to dark mode for reading' },
            ],
      };
    case 'arabic-learning':
      return {
        goal: isZh ? '用户正在多语言学习中心练习英语或阿拉伯语' : 'User is practicing languages in the Learning Hub',
        suggestions: isZh
          ? [
              { label: '陪我练口语', prompt: '用英语和我练习一段日常对话' },
              { label: '打开图书馆', prompt: '打开世界数字图书馆' },
              { label: '放首自习音乐', prompt: '放一首适合学习的轻音乐' },
            ]
          : [
              { label: 'Practice Dialogue', prompt: 'Practice a short bilingual dialogue with me' },
              { label: 'Digital Library', prompt: 'Open Digital Library' },
              { label: 'Study Music', prompt: 'Play lo-fi music for studying' },
            ],
      };
    case 'feed':
      return {
        goal: isZh ? '用户正在浏览全球动态并可能想互动或发帖' : 'User is browsing Global Feed and community updates',
        suggestions: isZh
          ? [
              { label: '发一条动态', prompt: '帮我发一条问候全世界的动态' },
              { label: '去消息通话', prompt: '打开信息与通话' },
              { label: '回到 3D 地球', prompt: '回到首页 3D 地球' },
            ]
          : [
              { label: 'Post Update', prompt: 'Create a global greeting post for me' },
              { label: 'Messages', prompt: 'Open Messages & Calls' },
              { label: 'Home Globe', prompt: 'Go back to the 3D Globe home' },
            ],
      };
    case 'browser':
    case 'mercury':
      return {
        goal: isZh ? '用户正在使用空间浏览器或水星全网索引检索' : 'User is searching the web or global index',
        suggestions: isZh
          ? [
              { label: '搜最新AI进展', prompt: '用浏览器帮我搜索最新AI前沿进展' },
              { label: '向下滚动', prompt: '帮我向下滚动页面' },
              { label: '知识图谱', prompt: '打开全域知识图谱' },
            ]
          : [
              { label: 'Search AI News', prompt: 'Search for latest AI news in the browser' },
              { label: 'Scroll Down', prompt: 'Scroll down the page' },
              { label: 'Knowledge Graph', prompt: 'Open Knowledge Universe' },
            ],
      };
    case 'game':
      return {
        goal: isZh ? '用户正在火星游戏中心准备体验互动游戏' : 'User is in Mars Game Center exploring interactive games',
        suggestions: isZh
          ? [
              { label: '太空飞行', prompt: '启动太空飞行游戏' },
              { label: '国际象棋', prompt: '启动太空国际象棋' },
              { label: '知识问答', prompt: '打开全球知识问答游戏' },
            ]
          : [
              { label: 'Space Flight', prompt: 'Launch Space Flight game' },
              { label: 'Space Chess', prompt: 'Open Space Chess' },
              { label: 'World Trivia', prompt: 'Start Global Knowledge Trivia' },
            ],
      };
    case 'universe':
    case 'moon':
    case 'academy':
      return {
        goal: isZh ? '用户正在探索 3D 太阳系宇宙、天文台或月球学院' : 'User is exploring 3D Universe, Observatory, or Moon Academy',
        suggestions: isZh
          ? [
              { label: '去星环影院', prompt: '带我去星环影院看宇宙纪录片' },
              { label: '去音乐空间', prompt: '进入金星音乐空间听歌' },
              { label: '回 3D 地球', prompt: '回到 3D 地球首页' },
            ]
          : [
              { label: 'Saturn Cinema', prompt: 'Go to Saturn Cinema and play a space doc' },
              { label: 'Venus Music', prompt: 'Enter Venus Music Space' },
              { label: 'Earth Home', prompt: 'Return to 3D Earth Home' },
            ],
      };
    case 'chat':
      return {
        goal: isZh ? '用户正在使用全球信息与实时音视频通话中心' : 'User is in Global Messenger & Call Center',
        suggestions: isZh
          ? [
              { label: '发起语音通话', prompt: '帮我打开发起语音通话' },
              { label: '去发现广场', prompt: '带我去发现动态广场' },
              { label: '放首轻音乐', prompt: '放点放松的轻音乐' },
            ]
          : [
              { label: 'Audio Call', prompt: 'Start an audio call' },
              { label: 'Global Feed', prompt: 'Switch to Discover Feed' },
              { label: 'Play Music', prompt: 'Play relaxing ambient music' },
            ],
      };
    case 'globe':
    default:
      return {
        goal: isZh ? '用户正在 EARTH ONE 3D 地球首页探索空间与各项功能' : 'User is on EARTH ONE Home exploring spaces and capabilities',
        suggestions: isZh
          ? [
              { label: '放首好听的歌', prompt: '帮我放一首放松的轻音乐' },
              { label: '看宇宙纪录片', prompt: '我想看一部宇宙探索纪录片' },
              { label: '进入 3D 宇宙', prompt: '带我进入 3D 宇宙太阳系' },
              { label: '飞往巴黎', prompt: '带我飞去巴黎看看' },
            ]
          : [
              { label: 'Play Music', prompt: 'Play relaxing ambient music for me' },
              { label: 'Watch Documentary', prompt: 'Watch a space documentary' },
              { label: '3D Universe', prompt: 'Take me to the 3D Universe Engine' },
              { label: 'Fly to Paris', prompt: 'Fly the globe to Paris' },
            ],
      };
  }
}

export function collectLivePageContext(opts: {
  currentTab: string;
  theme: 'light' | 'dark';
  lang: Language;
  isAuthenticated: boolean;
  userName?: string;
  userCity?: string;
  music?: {
    isPlaying: boolean;
    title?: string;
    artist?: string;
    volume?: number;
    muted?: boolean;
  };
}): LivePageContextSummary {
  const isZh = opts.lang === 'zh';
  const headings: string[] = [];
  const interactiveElements: string[] = [];
  const inputFields: Array<{ label: string; type: string; hasValue: boolean }> = [];

  if (typeof document !== 'undefined') {
    const seenHeadings = new Set<string>();
    document.querySelectorAll('h1, h2, h3').forEach((node) => {
      const el = node as HTMLElement;
      if (isInsideAiCompanion(el) || !isElementVisible(el)) return;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text && !seenHeadings.has(text)) {
        seenHeadings.add(text);
        headings.push(text.slice(0, 60));
      }
    });

    const seenButtons = new Set<string>();
    document.querySelectorAll('button, a[href], [role="button"], [role="tab"]').forEach((node) => {
      if (interactiveElements.length >= 28) return;
      const el = node as HTMLElement;
      if (isInsideAiCompanion(el) || !isElementVisible(el)) return;
      if ((el as HTMLButtonElement).disabled) return;
      const label = getElementLabel(el);
      if (label && !seenButtons.has(label.toLowerCase())) {
        seenButtons.add(label.toLowerCase());
        interactiveElements.push(label);
      }
    });

    document.querySelectorAll('input, textarea').forEach((node) => {
      if (inputFields.length >= 10) return;
      const el = node as HTMLInputElement | HTMLTextAreaElement;
      if (isInsideAiCompanion(el) || !isElementVisible(el)) return;
      if (el.disabled || el.type === 'hidden') return;
      inputFields.push({
        label: getInputLabel(el),
        type: el.type || 'text',
        hasValue: Boolean(el.value && el.value.trim().length > 0),
      });
    });
  }

  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const scrollH = typeof document !== 'undefined' ? document.documentElement.scrollHeight : 0;
  const innerH = typeof window !== 'undefined' ? window.innerHeight : 0;

  const { goal, suggestions } = inferUserGoalAndSuggestions(
    opts.currentTab,
    opts.isAuthenticated,
    isZh,
    Boolean(opts.music?.isPlaying)
  );

  return {
    currentTab: opts.currentTab,
    theme: opts.theme,
    lang: opts.lang,
    isAuthenticated: opts.isAuthenticated,
    userName: opts.userName,
    userCity: opts.userCity,
    music: opts.music,
    headings: headings.slice(0, 8),
    interactiveElements: interactiveElements.slice(0, 26),
    inputFields,
    scroll: {
      canScrollUp: scrollY > 24,
      canScrollDown: scrollH > innerH + scrollY + 24,
    },
    inferredGoal: goal,
    proactiveSuggestions: suggestions,
  };
}

function flashAgentHighlight(el: HTMLElement) {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  const prevTransition = el.style.transition;
  el.style.transition = 'outline 180ms ease';
  el.style.outline = '2px solid #E5C17D';
  el.style.outlineOffset = '3px';
  setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
    el.style.transition = prevTransition;
  }, 1100);
}

export function clickVisibleElementByLabel(targetLabel: string): { ok: boolean; matched?: string; reason?: string } {
  const q = targetLabel.trim().toLowerCase();
  if (!q) return { ok: false, reason: 'Empty targetLabel' };

  const candidates: Array<{ el: HTMLElement; label: string; score: number }> = [];
  document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [data-agent-action]').forEach((node) => {
    const el = node as HTMLElement;
    if (isInsideAiCompanion(el) || !isElementVisible(el)) return;
    if ((el as HTMLButtonElement).disabled) return;
    const label = getElementLabel(el);
    if (!label) return;
    const lower = label.toLowerCase();
    let score = 0;
    if (lower === q) score = 100;
    else if (lower.startsWith(q)) score = 80;
    else if (lower.includes(q)) score = 60;
    else if (q.includes(lower) && lower.length >= 2) score = 45;
    if (score > 0) candidates.push({ el, label, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return { ok: false, reason: `No visible element matched "${targetLabel}"` };
  }

  try {
    best.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {}
  flashAgentHighlight(best.el);
  best.el.click();
  return { ok: true, matched: best.label };
}

export function fillVisibleInputByLabel(
  targetLabel: string,
  value: string
): { ok: boolean; matched?: string; reason?: string } {
  const q = targetLabel.trim().toLowerCase();
  const candidates: Array<{ el: HTMLInputElement | HTMLTextAreaElement; label: string; score: number }> = [];

  document.querySelectorAll('input, textarea').forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement;
    if (isInsideAiCompanion(el) || !isElementVisible(el)) return;
    if (el.disabled || el.readOnly || el.type === 'hidden') return;
    const label = getInputLabel(el);
    const lower = label.toLowerCase();
    let score = 0;
    if (!q) score = 10;
    else if (lower === q) score = 100;
    else if (lower.includes(q) || q.includes(lower)) score = 70;
    else if ((el.type || '').toLowerCase() === q) score = 65;
    if (score > 0) candidates.push({ el, label, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    return { ok: false, reason: `No visible input matched "${targetLabel}"` };
  }

  const el = best.el;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {}
  flashAgentHighlight(el);
  el.focus();

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, matched: best.label };
}

export function scrollActiveSurface(direction: 'up' | 'down' | 'top' | 'bottom'): { ok: boolean } {
  const mainEl = document.querySelector('main');
  const target: HTMLElement | null =
    mainEl && mainEl.scrollHeight > mainEl.clientHeight + 20 ? mainEl : null;

  const amount = Math.round(window.innerHeight * 0.72);
  if (target) {
    if (direction === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
    else if (direction === 'up') target.scrollBy({ top: -amount, behavior: 'smooth' });
    else target.scrollBy({ top: amount, behavior: 'smooth' });
  } else {
    if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    else if (direction === 'up') window.scrollBy({ top: -amount, behavior: 'smooth' });
    else window.scrollBy({ top: amount, behavior: 'smooth' });
  }
  return { ok: true };
}
