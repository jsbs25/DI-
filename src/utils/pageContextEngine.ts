export interface PageContextSnapshot {
  timestamp: string;
  currentTab: string;
  spaceName: string;
  title: string;
  isLoggedIn: boolean;
  theme: 'dark' | 'light';
  lang: 'zh' | 'en' | 'ar';
  music: {
    isPlaying: boolean;
    title?: string;
    artist?: string;
    source?: string;
  };
  visibleText: string;
  buttons: Array<{ label: string; selector: string }>;
  inputs: Array<{ label: string; selector: string; type: string }>;
  shortcuts: string[];
}

const TAB_NAMES: Record<string, { zh: string; en: string }> = {
  globe: { zh: '地球首页', en: 'Globe Home' },
  universe: { zh: '3D 宇宙引擎', en: 'Universe Engine' },
  feed: { zh: '发现动态', en: 'Discover Feed' },
  chat: { zh: '信息与通话', en: 'Messages & Calls' },
  venus: { zh: '金星音乐空间', en: 'Venus Music Space' },
  'arabic-learning': { zh: '语言学习中心', en: 'Language Learning Center' },
  saturn: { zh: '星环影院', en: 'Saturn Cinema' },
  video: { zh: '影视视频中心', en: 'Video Center' },
  library: { zh: '世界数字图书馆', en: 'Digital Library' },
  browser: { zh: '空间浏览器', en: 'Space Browser' },
  universe3d: { zh: '宇宙空间', en: 'Universe Space' },
  aihub: { zh: 'DeepSeek 智能工作台', en: 'DeepSeek AI Hub' },
  knowledge: { zh: '全域知识图谱', en: 'Knowledge Universe' },
  moon: { zh: '月球天文观测台', en: 'Moon Observatory' },
  mercury: { zh: '全网索引', en: 'Global Index' },
  crawler: { zh: '采集网络中枢', en: 'Crawler Hub' },
  network: { zh: '网络中心', en: 'Network Center' },
  community: { zh: '数字社区', en: 'Communities' },
  creator: { zh: '创作中心', en: 'Creator Studio' },
  game: { zh: '火星游戏中心', en: 'Game Center' },
  brand: { zh: '品牌视觉系统', en: 'Brand Identity' },
};

export const EARTH_ONE_MODULE_TABS = Object.keys(TAB_NAMES);

function safeText(el: Element | null | undefined): string {
  if (!el) return '';
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function uniqueByLabel<T extends { label: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.label.toLowerCase();
    if (!item.label || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function capturePageContext(opts: {
  currentTab: string;
  lang: 'zh' | 'en' | 'ar';
  isLoggedIn: boolean;
  music?: { isPlaying: boolean; title?: string; artist?: string; source?: string };
}): PageContextSnapshot {
  const doc = typeof document !== 'undefined' ? document : null;
  const body = doc?.body;
  const theme: 'dark' | 'light' = doc?.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const title = doc?.title || '';
  const viewportText = (body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1400);

  const buttons = uniqueByLabel(
    Array.from(doc?.querySelectorAll('button, [role="button"], a[href]') || [])
      .slice(0, 120)
      .map((el, idx) => {
        const label = safeText(el) || (el as HTMLElement).getAttribute('aria-label') || (el as HTMLElement).getAttribute('title') || '';
        const id = (el as HTMLElement).id;
        const selector = id ? `#${CSS.escape(id)}` : `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
        return { label: label.slice(0, 80), selector };
      })
      .filter((b) => b.label.length >= 1),
    24
  );

  const inputs = uniqueByLabel(
    Array.from(doc?.querySelectorAll('input, textarea, select') || [])
      .slice(0, 80)
      .map((el, idx) => {
        const h = el as HTMLInputElement;
        const label =
          h.getAttribute('aria-label') ||
          h.getAttribute('placeholder') ||
          h.getAttribute('name') ||
          safeText(doc?.querySelector(`label[for="${CSS.escape(h.id || '')}"]`)) ||
          h.type ||
          'input';
        const selector = h.id ? `#${CSS.escape(h.id)}` : `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`;
        return { label: label.slice(0, 80), selector, type: h.type || el.tagName.toLowerCase() };
      }),
    16
  );

  const name = TAB_NAMES[opts.currentTab] || { zh: opts.currentTab, en: opts.currentTab };
  return {
    timestamp: new Date().toISOString(),
    currentTab: opts.currentTab,
    spaceName: opts.lang === 'zh' ? name.zh : name.en,
    title,
    isLoggedIn: opts.isLoggedIn,
    theme,
    lang: opts.lang,
    music: opts.music || { isPlaying: false },
    visibleText: viewportText,
    buttons,
    inputs,
    shortcuts: buildContextShortcuts(opts.currentTab, opts.lang),
  };
}

function buildContextShortcuts(tab: string, lang: 'zh' | 'en' | 'ar'): string[] {
  const zh = lang === 'zh';
  const common = zh
    ? ['切换深色/浅色', '回到地球首页', '打开音乐并播放', '帮我全网搜索']
    : ['Toggle theme', 'Go home', 'Play music', 'Search the web'];
  const byTab: Record<string, string[]> = {
    globe: zh ? ['飞到某个城市', '探索宇宙', '查看全球动态'] : ['Fly to a city', 'Explore universe', 'View global feed'],
    venus: zh ? ['播放轻音乐', '下一首', '暂停/继续'] : ['Play ambient music', 'Next track', 'Pause/resume'],
    saturn: zh ? ['搜纪录片并播放', '随机播放'] : ['Search documentary', 'Play random'],
    library: zh ? ['帮我找一本书并打开', '继续阅读'] : ['Find and open a book', 'Continue reading'],
    game: zh ? ['启动火星游戏', '推荐游戏'] : ['Launch a Mars game', 'Recommend game'],
    browser: zh ? ['搜索网页', '打开指定站点'] : ['Search web', 'Open a site'],
  };
  return [...(byTab[tab] || []), ...common].slice(0, 6);
}

export function formatPageContextForPrompt(ctx: PageContextSnapshot): string {
  const lines = [
    `space=${ctx.spaceName} (${ctx.currentTab})`,
    `loggedIn=${ctx.isLoggedIn} theme=${ctx.theme} lang=${ctx.lang}`,
    `title=${ctx.title}`,
    `music=${ctx.music.isPlaying ? `playing ${ctx.music.title || ''} ${ctx.music.artist || ''}`.trim() : 'stopped'}`,
  ];
  if (ctx.buttons.length) lines.push(`buttons=${ctx.buttons.map((b) => b.label).slice(0, 10).join(' | ')}`);
  if (ctx.inputs.length) lines.push(`inputs=${ctx.inputs.map((i) => i.label).slice(0, 6).join(' | ')}`);
  if (ctx.visibleText) lines.push(`visible=${ctx.visibleText.slice(0, 420)}`);
  return lines.join('\n');
}
