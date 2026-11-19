import React from 'react';
import { Compass, MessageCircle } from 'lucide-react';
import type {
  Conversation,
  CreatorArticle,
  GlobeCountryStat,
  GlobeUserNode,
  Language,
  Post,
  User,
  VideoItem,
} from '../../types/index.ts';
import { ParadiseWorld3D } from '../paradise/ParadiseWorld3D.tsx';
import { SpiritCommandBar } from './SpiritCommandBar.tsx';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';

type Props = {
  lang: Language;
  currentUser: User | null;
  nodes: GlobeUserNode[];
  countries: GlobeCountryStat[];
  posts: Post[];
  videos: VideoItem[];
  articles: CreatorArticle[];
  conversations: Conversation[];
  focusCoordinates: { lat: number; lng: number; timestamp?: number } | null;
  onSelectCountry: (countryCode: string | null) => void;
  onSelectUser: (user: GlobeUserNode) => void;
  onSelectTab: (tab: string) => void;
  onOpenBook?: (bookId: string) => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
  onOpenConversation?: (conversationId: string) => void;
  onOpenCallCenter?: () => void;
  immersive?: boolean;
  onImmersiveChange?: (v: boolean) => void;
};

export const OneHome: React.FC<Props> = ({
  lang,
  conversations,
  onSelectTab,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const isDay = snap.gardenDaylight > 0.44;

  const entryPillClass = isDay
    ? 'border-white/60 bg-[#f7f3eb]/72 text-[#1f3028] hover:bg-[#f7f3eb]/94 shadow-[0_8px_22px_rgba(24,36,28,0.12)]'
    : 'border-[#d6b77f]/20 bg-[#141d29]/66 text-[#f2eee6] hover:bg-[#141d29]/88 shadow-[0_10px_26px_rgba(4,8,14,0.34)]';

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0e1928]">
      <ParadiseWorld3D
        lang={lang}
        immersive={immersive}
        onImmersiveChange={onImmersiveChange}
      />

      {/* Left Garden-Harmonized Quick Entries (Chat + Spaces) */}
      {!immersive && !snap.commDrawerOpen && (
        <div className="pointer-events-auto fixed left-3.5 top-[calc(3.9rem+env(safe-area-inset-top))] md:top-1/2 md:-translate-y-1/2 z-30 flex flex-row md:flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => uiStateManager.setCommDrawerOpen(true)}
            data-testid="left-comm-entry"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${entryPillClass}`}
            title={isZh ? '打开左侧消息与通话抽屉' : 'Open Communication Drawer'}
          >
            <MessageCircle className="h-3.5 w-3.5 opacity-85" />
            <span className="hidden sm:inline">{isZh ? '通信' : 'Chat'}</span>
            {unreadTotal > 0 && (
              <span
                className={`inline-flex min-w-[16px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-semibold ${
                  isDay ? 'bg-[#244e41] text-[#f7f4ee]' : 'bg-[#e5d9be] text-[#141e28]'
                }`}
              >
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('universe')}
            data-testid="left-spaces-entry"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${entryPillClass}`}
            title={isZh ? '探索全部空间模块' : 'Explore All Spaces'}
          >
            <Compass className="h-3.5 w-3.5 opacity-85" />
            <span className="hidden sm:inline">{isZh ? '空间' : 'Spaces'}</span>
          </button>
        </div>
      )}

      {/* Compact Garden-Blended Bottom AI Chat & Voice Bar */}
      {!immersive && <SpiritCommandBar lang={lang} />}
    </main>
  );
};

