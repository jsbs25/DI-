import type { Language } from '../types/index.ts';
import type { MusicPlayerApi } from '../music/PlayerContext.tsx';
import { solvePrecisionQuery } from './precisionSolver.ts';
import {
  clickVisibleElementByLabel,
  fillVisibleInputByLabel,
  scrollActiveSurface,
  type LivePageContextSummary,
} from './pageContextEngine.ts';
import { uiStateManager } from '../agent/uiStateManager.ts';
import {
  generateFreePoolImage,
  requestInstantSpokenRescue,
  speakSpiritReply,
} from '../agent/agentClient.ts';

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
  | {
      type: 'open_book';
      query: string;
      reply: string;
    }
  | { type: 'navigate_tab'; tab: string; reply: string }
  | { type: 'browser_search'; query: string; reply: string }
  | { type: 'fly_to'; lat: number; lng: number; place: string; reply: string }
  | { type: 'set_theme'; theme: 'dark' | 'light'; reply: string }
  | { type: 'set_language'; lang: Language; reply: string }
  | { type: 'none' };

export interface WebsiteControlHandlers {
  lang: Language;
  theme: 'light' | 'dark';
  player: MusicPlayerApi | null;
  getPageContext: () => LivePageContextSummary;
  onNavigateTab?: (tab: string) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean }) => void;
  onOpenBookAction?: (opts: { query: string }) => void;
  onWatchDocumentaryAction?: (opts: {
    query: string;
    platform?: 'all' | 'bilibili' | 'youtube';
    randomPick?: boolean;
  }) => void;
  onBrowserSearchAction?: (query: string) => void;
  onGlobalSearchAction?: (query: string) => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onSetLang?: (lang: Language) => void;
  onSetImmersive?: (v: boolean) => void;
  onOpenCommandPalette?: () => void;
  onReplayIntro?: () => void;
  onCreatePost?: (postData: { content: string; category: string }) => Promise<void> | void;
  onCreateArticle?: (articleData: { title: string; content: string; category: string }) => Promise<void> | void;
  onFilterCountry?: (countryCode: string | null) => void;
  onToggleJoinCommunity?: (commId: string) => void;
  onOpenBook?: (bookId: string) => void;
  onOpenKnowledge?: (nodeId: string) => void;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  onOpenSecurity?: () => void;
  onToggleLocationPrivacy?: () => void;
  onOpenMessages?: (conversationId?: string) => void;
  onOpenCalls?: () => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
}

export interface ExecutedToolFeedback {
  ok: boolean;
  summary: string;
  response: Record<string, unknown>;
}

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

const SPACE_LABELS: Record<string, { zh: string; en: string }> = {
  globe: { zh: '首页 · 3D地球', en: 'Home' },
  feed: { zh: '发现动态', en: 'Discover Feed' },
  chat: { zh: '信息与通话', en: 'Messages & Calls' },
  venus: { zh: '音乐空间', en: 'Music Space' },
  'arabic-learning': { zh: '语言学习中心', en: 'Language Center' },
  universe: { zh: '3D 宇宙引擎', en: 'Universe Engine' },
  saturn: { zh: '星环影院', en: 'Saturn Cinema' },
  video: { zh: '影视视频中心', en: 'Video Center' },
  library: { zh: '世界数字图书馆', en: 'Digital Library' },
  browser: { zh: '空间浏览器', en: 'Web Browser' },
  knowledge: { zh: '全域知识图谱', en: 'Knowledge Universe' },
  creator: { zh: '创作中心', en: 'Creator Studio' },
  community: { zh: '数字社区', en: 'Communities' },
  moon: { zh: '天文观测台', en: 'Observatory' },
  mercury: { zh: '全网索引', en: 'Mercury Search' },
  crawler: { zh: '采集网络中枢', en: 'Crawler Hub' },
  network: { zh: 'ONE 网络中心', en: 'Network Center' },
  aihub: { zh: 'AI 智能中枢', en: 'AI Hub' },
  academy: { zh: '月球学院', en: 'Moon Academy' },
  game: { zh: '火星游戏中心', en: 'Game Center' },
  brand: { zh: '品牌视觉系统', en: 'Brand System' },
};

export function extractInlineAgentDirective(raw: string): {
  action: OneAgentAction | null;
  cleanText: string;
} {
  let parsedAction: OneAgentAction | null = null;
  const cleanText = raw
    .replace(/\[\[ACTION:([\s\S]*?)\]\]/g, (_all, jsonStr: string) => {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj && typeof obj.type === 'string' && obj.type !== 'none') {
          parsedAction = obj as OneAgentAction;
        }
      } catch {}
      return '';
    })
    .trim();
  return { action: parsedAction, cleanText };
}

export async function executeGeminiToolCall(
  name: string,
  args: Record<string, unknown>,
  h: WebsiteControlHandlers
): Promise<ExecutedToolFeedback> {
  const isZh = h.lang === 'zh';
  const player = h.player;

  switch (name) {
    case 'navigate_to_space': {
      const space = String(args.space || 'globe').trim().toLowerCase();
      if (space === 'universe' && !h.onNavigateTab && h.onExploreUniverse) {
        h.onExploreUniverse();
      } else {
        h.onNavigateTab?.(space);
      }
      const label = SPACE_LABELS[space]?.[isZh ? 'zh' : 'en'] || space;
      return {
        ok: true,
        summary: isZh ? `已切换至 ${label}` : `Navigated to ${label}`,
        response: { ok: true, currentTab: space, label },
      };
    }

    case 'control_music_player': {
      const action = String(args.action || 'play_query');
      if (action === 'next') {
        player?.playNext();
        return {
          ok: true,
          summary: isZh ? '已切换至下一首' : 'Skipped to next track',
          response: { ok: true, action: 'next' },
        };
      }
      if (action === 'previous') {
        player?.playPrevious();
        return {
          ok: true,
          summary: isZh ? '已切回上一首' : 'Returned to previous track',
          response: { ok: true, action: 'previous' },
        };
      }
      if (action === 'pause' || action === 'stop') {
        player?.stopAndHold();
        return {
          ok: true,
          summary: isZh ? '已暂停音乐播放' : 'Paused music playback',
          response: { ok: true, action },
        };
      }
      if (action === 'resume') {
        if (player?.currentTrack) {
          player.activateMusicSession();
          player.unlockAudio();
          void player.resumeAudioContext();
          player.play();
        } else {
          player?.activateMusicSession();
          h.onPlayMusicAction?.({ crawl: true });
        }
        return {
          ok: true,
          summary: isZh ? '已恢复音乐播放' : 'Resumed music playback',
          response: { ok: true, action: 'resume' },
        };
      }
      if (action === 'set_volume') {
        const rawVol = typeof args.volume === 'number' ? args.volume : 60;
        const normalized = rawVol > 1 ? Math.min(1, Math.max(0, rawVol / 100)) : Math.min(1, Math.max(0, rawVol));
        player?.setVolume(normalized);
        const pct = Math.round(normalized * 100);
        return {
          ok: true,
          summary: isZh ? `音乐音量已调至 ${pct}%` : `Volume set to ${pct}%`,
          response: { ok: true, volume: pct },
        };
      }
      if (action === 'toggle_mute') {
        player?.toggleMute();
        return {
          ok: true,
          summary: isZh ? '已切换音乐静音状态' : 'Toggled music mute',
          response: { ok: true, muted: !player?.state.muted },
        };
      }
      if (action === 'toggle_shuffle') {
        player?.toggleShuffle();
        return {
          ok: true,
          summary: isZh ? '已切换随机播放' : 'Toggled shuffle',
          response: { ok: true, shuffle: !player?.state.mode.shuffle },
        };
      }
      if (action === 'set_repeat') {
        const mode = (args.repeatMode === 'all' || args.repeatMode === 'one' ? args.repeatMode : 'off') as 'off' | 'all' | 'one';
        player?.setRepeatMode(mode);
        return {
          ok: true,
          summary: isZh ? `循环模式已设为 ${mode}` : `Repeat mode set to ${mode}`,
          response: { ok: true, repeatMode: mode },
        };
      }

      const query = typeof args.query === 'string' ? args.query.trim() : '';
      player?.activateMusicSession();
      player?.unlockAudio();
      if (h.onPlayMusicAction) {
        h.onPlayMusicAction({ query, crawl: true });
      } else {
        h.onNavigateTab?.('venus');
      }
      return {
        ok: true,
        summary: query
          ? isZh
            ? `正在播放「${query}」`
            : `Playing "${query}"`
          : isZh
            ? '已开启音乐播放'
            : 'Started music playback',
        response: { ok: true, action: 'play_query', query },
      };
    }

    case 'watch_cinema_video': {
      const query = typeof args.query === 'string' && args.query.trim() ? args.query.trim() : '宇宙 纪录片 4K';
      const platform =
        args.platform === 'bilibili' || args.platform === 'youtube' ? args.platform : 'all';
      const autoPlay = args.autoPlay !== false;
      if (h.onWatchDocumentaryAction) {
        h.onWatchDocumentaryAction({ query, platform, randomPick: autoPlay });
      } else {
        h.onNavigateTab?.('saturn');
      }
      return {
        ok: true,
        summary: isZh ? `星环影院搜索「${query}」` : `Cinema playing "${query}"`,
        response: { ok: true, query, platform, autoPlay },
      };
    }

    case 'open_book_action': {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (h.onOpenBookAction && query) {
        h.onOpenBookAction({ query });
      } else {
        h.onNavigateTab?.('library');
      }
      return {
        ok: true,
        summary: query
          ? isZh
            ? `已在数字图书馆搜索「${query}」`
            : `Opened "${query}" in Library`
          : isZh
            ? '已打开世界数字图书馆'
            : 'Opened Digital Library',
        response: { ok: true, query },
      };
    }

    case 'open_game': {
      const game = typeof args.game === 'string' ? args.game.trim() : '';
      h.onNavigateTab?.('game');
      if (typeof window !== 'undefined' && game) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('one-game-launch', { detail: { game } }));
        }, 120);
      }
      return {
        ok: true,
        summary: game
          ? isZh
            ? `已进入游戏中心 (${game})`
            : `Opened Game Center (${game})`
          : isZh
            ? '已进入火星游戏中心'
            : 'Opened Mars Game Center',
        response: { ok: true, game },
      };
    }

    case 'control_earth_globe': {
      const action = String(args.action || 'fly_to');
      if (action === 'open_command_palette') {
        h.onOpenCommandPalette?.();
        return {
          ok: true,
          summary: isZh ? '已打开命令中心' : 'Opened Command Palette',
          response: { ok: true, action },
        };
      }
      if (action === 'replay_intro') {
        h.onReplayIntro?.();
        return {
          ok: true,
          summary: isZh ? '正在重播启航动画' : 'Replaying cinematic intro',
          response: { ok: true, action },
        };
      }
      if (action === 'set_immersive') {
        const immersive = Boolean(args.immersive);
        h.onSetImmersive?.(immersive);
        return {
          ok: true,
          summary: isZh
            ? immersive
              ? '已进入沉浸模式'
              : '已退出沉浸模式'
            : immersive
              ? 'Entered immersive mode'
              : 'Exited immersive mode',
          response: { ok: true, immersive },
        };
      }
      const lat = typeof args.lat === 'number' ? args.lat : 39.9042;
      const lng = typeof args.lng === 'number' ? args.lng : 116.4074;
      const placeName = typeof args.placeName === 'string' ? args.placeName : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
      h.onFlyTo?.(lat, lng);
      return {
        ok: true,
        summary: isZh ? `已定位飞往 ${placeName}` : `Flying to ${placeName}`,
        response: { ok: true, lat, lng, placeName },
      };
    }

    case 'browser_and_search': {
      const mode = String(args.mode || 'browser_url_or_search');
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (mode === 'global_search') {
        h.onGlobalSearchAction?.(query);
        return {
          ok: true,
          summary: isZh ? `已全站搜索「${query}」` : `Global search "${query}"`,
          response: { ok: true, mode, query },
        };
      }
      if (query) {
        h.onBrowserSearchAction?.(query);
      } else {
        h.onNavigateTab?.('browser');
      }
      return {
        ok: true,
        summary: isZh ? `浏览器打开「${query || '主页'}」` : `Browser "${query || 'home'}"`,
        response: { ok: true, mode, query },
      };
    }

    case 'control_appearance': {
      const parts: string[] = [];
      if (typeof args.theme === 'string') {
        const nextTheme =
          args.theme === 'toggle'
            ? h.theme === 'dark'
              ? 'light'
              : 'dark'
            : args.theme === 'dark'
              ? 'dark'
              : 'light';
        h.onSetTheme?.(nextTheme);
        parts.push(isZh ? (nextTheme === 'dark' ? '深色模式' : '浅色模式') : `${nextTheme} mode`);
      }
      if (typeof args.language === 'string') {
        const allowed = ['zh', 'en', 'ar', 'es', 'fr', 'ru'];
        if (allowed.includes(args.language)) {
          h.onSetLang?.(args.language as Language);
          parts.push(isZh ? `语言: ${args.language}` : `lang: ${args.language}`);
        }
      }
      return {
        ok: true,
        summary: parts.length ? parts.join(' · ') : isZh ? '已更新外观设置' : 'Appearance updated',
        response: { ok: true, applied: parts },
      };
    }

    case 'social_and_community': {
      const action = String(args.action || '');
      if (action === 'create_post') {
        const content = typeof args.content === 'string' ? args.content.trim() : '';
        if (!content) {
          return { ok: false, summary: 'Missing post content', response: { ok: false, error: 'content required' } };
        }
        await h.onCreatePost?.({
          content,
          category: typeof args.category === 'string' ? args.category : 'life',
        });
        h.onNavigateTab?.('feed');
        return {
          ok: true,
          summary: isZh ? '已发布动态到发现广场' : 'Published post to Discover Feed',
          response: { ok: true, action, content },
        };
      }
      if (action === 'filter_country') {
        const code = typeof args.targetId === 'string' ? args.targetId.toUpperCase() : null;
        h.onFilterCountry?.(code);
        h.onNavigateTab?.('feed');
        return {
          ok: true,
          summary: isZh ? `已按国家筛选动态 (${code || '全部'})` : `Filtered feed (${code || 'all'})`,
          response: { ok: true, countryCode: code },
        };
      }
      if (action === 'create_article') {
        const title = typeof args.title === 'string' ? args.title.trim() : 'Untitled';
        const content = typeof args.content === 'string' ? args.content.trim() : '';
        await h.onCreateArticle?.({
          title,
          content,
          category: typeof args.category === 'string' ? args.category : 'thought',
        });
        h.onNavigateTab?.('creator');
        return {
          ok: true,
          summary: isZh ? `已发布文章「${title}」` : `Published article "${title}"`,
          response: { ok: true, title },
        };
      }
      if (action === 'join_community' && typeof args.targetId === 'string') {
        h.onToggleJoinCommunity?.(args.targetId);
        h.onNavigateTab?.('community');
        return {
          ok: true,
          summary: isZh ? '已更新社区加入状态' : 'Updated community membership',
          response: { ok: true, communityId: args.targetId },
        };
      }
      if (action === 'open_book' && typeof args.targetId === 'string') {
        h.onOpenBook?.(args.targetId);
        return {
          ok: true,
          summary: isZh ? '已在图书馆打开书籍' : 'Opened book in Library',
          response: { ok: true, bookId: args.targetId },
        };
      }
      if (action === 'open_knowledge' && typeof args.targetId === 'string') {
        h.onOpenKnowledge?.(args.targetId);
        return {
          ok: true,
          summary: isZh ? '已定位知识图谱节点' : 'Focused knowledge node',
          response: { ok: true, nodeId: args.targetId },
        };
      }
      if (action === 'open_profile') {
        h.onOpenProfile?.();
        return { ok: true, summary: isZh ? '已打开个人资料' : 'Opened profile', response: { ok: true } };
      }
      if (action === 'open_auth') {
        h.onOpenAuth?.();
        return { ok: true, summary: isZh ? '已打开账号弹窗' : 'Opened account modal', response: { ok: true } };
      }
      if (action === 'open_security') {
        h.onOpenSecurity?.();
        return { ok: true, summary: isZh ? '已打开账号安全中心' : 'Opened account security', response: { ok: true } };
      }
      if (action === 'toggle_location_privacy') {
        h.onToggleLocationPrivacy?.();
        return { ok: true, summary: isZh ? '已切换位置隐私状态' : 'Toggled location privacy', response: { ok: true } };
      }
      return { ok: false, summary: 'Unsupported social action', response: { ok: false, error: 'Unsupported action' } };
    }

    case 'messaging_and_calls': {
      const action = String(args.action || 'open_messages');
      const target = typeof args.targetNameOrId === 'string' ? args.targetNameOrId.trim() : undefined;
      if (action === 'open_calls') {
        h.onOpenCalls?.();
        return { ok: true, summary: isZh ? '已打开通话中心' : 'Opened Call Center', response: { ok: true } };
      }
      if (action === 'start_audio_call') {
        h.onQuickCall?.('audio', { conversationId: target || 'conv_global' });
        return { ok: true, summary: isZh ? '正在发起语音通话' : 'Starting audio call', response: { ok: true } };
      }
      if (action === 'start_video_call') {
        h.onQuickCall?.('video', { conversationId: target || 'conv_global' });
        return { ok: true, summary: isZh ? '正在发起视频通话' : 'Starting video call', response: { ok: true } };
      }
      h.onOpenMessages?.(target);
      return { ok: true, summary: isZh ? '已打开信息中心' : 'Opened Messages', response: { ok: true } };
    }

    case 'interact_with_page': {
      const action = String(args.action || 'inspect');
      if (action === 'inspect') {
        const ctx = h.getPageContext();
        return {
          ok: true,
          summary: isZh ? '已感知当前页面元素' : 'Inspected current webpage',
          response: { ok: true, pageContext: ctx },
        };
      }
      if (action === 'scroll') {
        const dir =
          args.scrollDirection === 'up' ||
          args.scrollDirection === 'top' ||
          args.scrollDirection === 'bottom'
            ? args.scrollDirection
            : 'down';
        scrollActiveSurface(dir);
        return {
          ok: true,
          summary: isZh ? `已向${dir === 'up' ? '上' : dir === 'top' ? '顶部' : dir === 'bottom' ? '底部' : '下'}滚动页面` : `Scrolled ${dir}`,
          response: { ok: true, direction: dir },
        };
      }
      if (action === 'click_element') {
        const label = typeof args.targetLabel === 'string' ? args.targetLabel : '';
        const res = clickVisibleElementByLabel(label);
        return {
          ok: res.ok,
          summary: res.ok
            ? isZh
              ? `已点击「${res.matched}」`
              : `Clicked "${res.matched}"`
            : res.reason || 'Element not found',
          response: res,
        };
      }
      if (action === 'fill_input') {
        const label = typeof args.targetLabel === 'string' ? args.targetLabel : '';
        const val = typeof args.value === 'string' ? args.value : '';
        const res = fillVisibleInputByLabel(label, val);
        return {
          ok: res.ok,
          summary: res.ok
            ? isZh
              ? `已在「${res.matched}」填入内容`
              : `Filled "${res.matched}"`
            : res.reason || 'Input not found',
          response: res,
        };
      }
      return { ok: false, summary: 'Unknown page interaction', response: { ok: false } };
    }

    case 'start_language_studio': {
      const allowedLangs = ['en', 'ar', 'ja', 'fr', 'es', 'ko'] as const;
      const rawLang = typeof args.targetLang === 'string' ? args.targetLang.toLowerCase() : 'en';
      const targetLang = (allowedLangs.includes(rawLang as any) ? rawLang : 'en') as
        | 'en'
        | 'ar'
        | 'ja'
        | 'fr'
        | 'es'
        | 'ko';
      const mode = args.mode === 'quiz' ? 'quiz' : 'roleplay';
      const scenarioId = typeof args.scenarioId === 'string' && args.scenarioId.trim() ? args.scenarioId.trim() : 'cafe';
      uiStateManager.openLanguageStudio({ targetLang, mode, scenarioId });
      return {
        ok: true,
        summary: isZh
          ? `已开启${mode === 'quiz' ? '语言智能出题' : '实景口语对话'}教室 (${targetLang.toUpperCase()})`
          : `Opened Language Studio (${mode}, ${targetLang})`,
        response: { ok: true, targetLang, mode, scenarioId },
      };
    }

    case 'language_rescue_hint': {
      const allowedLangs = ['en', 'ar', 'ja', 'fr', 'es', 'ko'] as const;
      const rawLang = typeof args.targetLang === 'string' ? args.targetLang.toLowerCase() : 'en';
      const targetLang = (allowedLangs.includes(rawLang as any) ? rawLang : 'en') as
        | 'en'
        | 'ar'
        | 'ja'
        | 'fr'
        | 'es'
        | 'ko';
      const userIntent = typeof args.userIntent === 'string' ? args.userIntent : '';
      const rescue = await requestInstantSpokenRescue(userIntent || undefined);
      if (rescue?.expressions?.length) {
        void speakSpiritReply(rescue.expressions[0].targetText, targetLang);
        return {
          ok: true,
          summary: isZh ? '已在精灵头顶弹出 3 句急救口语示范' : 'Displayed 3 spoken rescue options on Spirit bubble',
          response: { ok: true, expressions: rescue.expressions },
        };
      }
      return {
        ok: false,
        summary: isZh ? '获取口语急救失败' : 'Failed to generate spoken rescue',
        response: { ok: false, error: 'Rescue generation failed' },
      };
    }

    case 'generate_image': {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      if (!prompt) {
        return {
          ok: false,
          summary: isZh ? '缺少画面描述' : 'Missing image prompt',
          response: { ok: false, error: 'Prompt required' },
        };
      }
      const aspectRatio =
        args.aspectRatio === '1:1' || args.aspectRatio === '16:9' || args.aspectRatio === '3:4'
          ? args.aspectRatio
          : '4:3';
      const style = typeof args.style === 'string' ? args.style : undefined;
      try {
        const img = await generateFreePoolImage(prompt, { aspectRatio, style, mode: 'standalone' });
        if (img) {
          return {
            ok: true,
            summary: isZh
              ? `已为你生成图片：「${img.captionZh || '画面'}」`
              : `Generated artwork: "${img.captionZh || 'Artwork'}"`,
            response: { ok: true, captionZh: img.captionZh },
          };
        }
      } catch {
        // handled below
      }
      return {
        ok: false,
        summary: isZh ? '画室当前繁忙，请稍后重试' : 'Art studio temporarily busy',
        response: { ok: false, error: 'Image generation failed' },
      };
    }

    default:
      return {
        ok: false,
        summary: `Unknown tool: ${name}`,
        response: { ok: false, error: `Unknown tool ${name}` },
      };
  }
}

function isConversationalHypotheticalOrQuestion(
  text: string,
  _history?: Array<{ role: 'user' | 'assistant'; content: string }>
): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (/(?:别打开|不要打开|别去|不要去|不用打开|不用放|不是让你|别老是|不要像|不希望.{0,8}(?:自动|乱|像))/.test(clean)) {
    return true;
  }
  if (
    /(?:我想做一个|我要做一个|正在开发|正在设计|构想|思路|讨论一下|如果能|比如|例如|像.+一样|既能.+又能|不仅.+还能|我希望它(?:能够?)?|设计一个|打造一个|评估一下)/i.test(
      clean
    )
  ) {
    return true;
  }
  if (
    /(?:能学啥|有什么用|是什么|什么意思|为什么|怎么样|好用吗|原理|区别|介绍)/.test(clean) &&
    !/^(打开|进入|切换|播放|放|听|看|读|找|带我去)/.test(clean)
  ) {
    return true;
  }
  return false;
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
    .replace(
      /(我想|我要|帮我|请帮我|给我|麻烦|随便|随机|自动|去看|看那个|看个|看一部|看部|打开那个|打开|搜索一个|搜索|搜一个|搜一下|找一个|找部|看|纪录片|记录片|电影|视频|片子|影视|的|关于|吧|啊|documentary|watch|movie|video|film|about|on)/gi,
      ' '
    )
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

export function parseInstantAgentAction(
  text: string,
  isZh: boolean,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): OneAgentAction | null {
  const raw = text.trim();
  if (!raw) return null;
  if (isConversationalHypotheticalOrQuestion(raw, history)) return null;
  const lower = raw.toLowerCase();

  if (
    /停止播放|停止放歌|停止音乐|别放了|别播了|别放歌|别唱了|关掉音乐|关闭音乐|关闭播放|关了音乐|把音乐关|把歌关|把音乐停|把歌停|停一下|不听了|不要听了|暂停播放|暂停音乐|stop playing|stop music|stop the music|turn off music|pause music|^pause$/i.test(
      raw
    )
  ) {
    return {
      type: 'play_music',
      control: 'stop',
      reply: isZh ? '好的，先为你把音乐停下来啦。' : 'Got it, pausing the music for you.',
    };
  }
  if (/继续播放|继续放歌|继续放|继续听|接着放|接着播|恢复播放|恢复音乐|再放音乐|resume music|resume playing|continue playing/i.test(raw)) {
    return {
      type: 'play_music',
      control: 'resume',
      reply: isZh ? '好呀，继续为你播放音乐！' : 'Sure thing, resuming your music!',
    };
  }
  if (/下一首|下一曲|换一首|换首歌|换个歌|切歌|不好听|换一个歌|next song|next track|skip track/i.test(raw)) {
    return { type: 'play_music', control: 'next', reply: isZh ? '收到，马上切到下一首～' : 'Skipping to the next track!' };
  }
  if (/上一首|上一曲|previous song|previous track/i.test(raw)) {
    return { type: 'play_music', control: 'prev', reply: isZh ? '好的，回到上一首歌。' : 'Going back to the previous track.' };
  }

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
          ? `好呀！正在打开音乐空间为你找「${query}」来听。`
          : `Opening Music Space and playing ${query} for you!`
        : isZh
          ? '好呀，马上打开音乐空间为你放首歌！'
          : 'Opening Music Space and starting a track for you!',
    };
  }

  if (/纪录片|记录片|看电影|看视频|看大片|看片|影院|星环影院|documentary|watch.*(movie|video|film|doc)/i.test(raw)) {
    const query = extractDocumentaryQuery(raw);
    const platform = /b站|bilibili/i.test(raw) ? 'bilibili' : /youtube/i.test(raw) ? 'youtube' : 'all';
    return {
      type: 'watch_documentary',
      query,
      platform,
      randomPick: true,
      reply: isZh
        ? `太棒了！带你去星环影院看「${query}」。`
        : `Awesome! Opening Saturn Cinema for ${query}.`,
    };
  }

  if (/^(帮我|请)?(上网|用浏览器|在浏览器)?(查一下|搜一下|搜索|百度一下|谷歌一下)/.test(raw) || /打开浏览器/i.test(raw)) {
    const q = raw
      .replace(/^(帮我|请)?(上网|用浏览器|在浏览器)?(查一下|搜一下|搜索|百度一下|谷歌一下|打开浏览器)/i, '')
      .trim();
    if (q) {
      return {
        type: 'browser_search',
        query: q,
        reply: isZh ? `好的，正在空间浏览器里帮你搜索「${q}」。` : `Searching for ${q} in Space Browser.`,
      };
    }
    return {
      type: 'navigate_tab',
      tab: 'browser',
      reply: isZh ? '已为你打开空间浏览器。' : 'Opening Web Browser.',
    };
  }

  if (/深色模式|暗黑模式|黑夜模式|夜间模式|太亮了|有点刺眼|dark mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'dark', reply: isZh ? '没问题，已经帮你切换成护眼的深色模式了。' : 'Switched to dark mode.' };
  }
  if (/浅色模式|明亮模式|白天模式|日间模式|light mode/i.test(raw)) {
    return { type: 'set_theme', theme: 'light', reply: isZh ? '好的，已切换成清透的浅色模式。' : 'Switched to light mode.' };
  }
  if (/切换英文|换成英文|用英文|english mode|switch to english/i.test(raw)) {
    return { type: 'set_language', lang: 'en', reply: 'Switched interface language to English.' };
  }
  if (/切换中文|换成中文|用中文|chinese mode|switch to chinese/i.test(raw)) {
    return { type: 'set_language', lang: 'zh', reply: '已为你将界面语言切换为中文。' };
  }

  if (/带我去|飞到|飞往|定位到|去看看/.test(raw)) {
    for (const p of PLACE_COORDS) {
      if (p.names.some((n) => lower.includes(n))) {
        return {
          type: 'fly_to',
          lat: p.lat,
          lng: p.lng,
          place: isZh ? p.zh : p.en,
          reply: isZh ? `出发！正在带你飞往${p.zh}。` : `Taking off! Flying to ${p.en}.`,
        };
      }
    }
  }

  const navRules: Array<{ test: RegExp; tab: string; zh: string; en: string }> = [
    { test: /多邻国|多林国|语言学习|学英语|学语言|英语引擎|阿拉伯语|duolingo|arabic|english learning|language center|language learning/i, tab: 'arabic-learning', zh: '语言学习中心', en: 'Language Center' },
    { test: /信息与通话|打开信息|打开消息|发消息|通话|私信|chat|messenger|messages/i, tab: 'chat', zh: '信息与通话', en: 'Messages' },
    { test: /发现|动态|广场|feed|discover/i, tab: 'feed', zh: '发现动态', en: 'Discover' },
    { test: /音乐馆|音乐空间|音乐中心|打开音乐|music/i, tab: 'venus', zh: '音乐空间', en: 'Music Space' },
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
    { test: /回到首页|打开首页|回首页|主页|地球|回到桌面|home|globe/i, tab: 'globe', zh: '首页', en: 'Home' },
  ];

  for (const r of navRules) {
    if (r.test.test(raw)) {
      return {
        type: 'navigate_tab',
        tab: r.tab,
        reply: isZh ? `好的，已经为你打开${r.zh}。` : `Opened ${r.en} for you.`,
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
      ? '我在听，怎么啦？随时问我或者让我帮你操控网站都行。'
      : 'Hi, I am right here. What can I help you with?';
  }
  if (/你在干嘛|干嘛呢|做什么呢|忙什么|在忙吗|在干什么|what are you doing/i.test(raw)) {
    return isZh
      ? '一直在等你开口呀，刚听着动静呢！想聊聊天、算点什么，还是去音乐空间听首歌？'
      : 'Right here waiting for you! Want to chat, look something up, or put on some music?';
  }
  if (/^(早安|早上好|good morning)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '早上好！新的一天元气满满，想先听首歌还是看点有趣的？'
      : 'Good morning! Wishing you a great day ahead.';
  }
  if (/^(晚安|要睡了|去睡觉|good night)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '晚安，好好休息，我一直在这里陪着你。'
      : 'Good night, get some good rest.';
  }
  if (/好累|累死了|心累|不开心|难过|伤心|委屈|压力好大|心情不好|烦死了|焦虑|孤单|tired|sad|stressed|lonely/i.test(raw)) {
    return isZh
      ? '辛苦了，先歇口气吧。要不要我放一首轻柔舒缓的音乐陪陪你？'
      : 'Sounds like a long day. Take a breather—want me to put on some relaxing music?';
  }
  if (/^(开心|好开心|高兴|太好了|哈哈|happy|awesome)[!！。~～]*$/i.test(raw)) {
    return isZh
      ? '太棒了！真替你开心，这种好心情要好好延续下去呀！'
      : 'That is wonderful to hear! So glad things are going well!';
  }
  if (/^(谢谢|感谢|谢谢你|thanks|thank you)[!！。~～]*$/i.test(lower)) {
    return isZh ? '不客气呀，随时叫我就行！' : 'You are very welcome, anytime!';
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
    ? '我听到啦！你可以直接跟我聊天、随时打断我，或者让我帮你放歌、找书、看纪录片、切换主题和操控页面。'
    : 'I heard you! Feel free to chat, interrupt me anytime, or ask me to control anything on EARTH ONE.';
}

export async function resolveNaturalAgentAction(text: string, isZh: boolean): Promise<OneAgentAction> {
  const instant = parseInstantAgentAction(text, isZh);
  if (instant) return instant;
  return { type: 'none' };
}
