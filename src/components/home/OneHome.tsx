import React from 'react';
import { MessageCircle } from 'lucide-react';
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
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const isDay = snap.gardenDaylight > 0.44;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0e1928]">
      <ParadiseWorld3D
        lang={lang}
        immersive={immersive}
        onImmersiveChange={onImmersiveChange}
      />

      {/* Left Communication Entry (seamlessly harmonized with garden day/night tone) */}
      {!immersive && !snap.commDrawerOpen && (
        <button
          type="button"
          onClick={() => uiStateManager.setCommDrawerOpen(true)}
          data-testid="left-comm-entry"
          className={`pointer-events-auto fixed left-3.5 top-[calc(3.9rem+env(safe-area-inset-top))] md:top-1/2 md:-translate-y-1/2 z-30 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            isDay
              ? 'border-white/55 bg-[#f7f3eb]/68 text-[#223029] hover:bg-[#f7f3eb]/90 shadow-[0_8px_22px_rgba(24,36,28,0.12)]'
              : 'border-white/14 bg-[#141d29]/58 text-[#f2eee6] hover:bg-[#141d29]/82 shadow-[0_10px_26px_rgba(4,8,14,0.32)]'
          }`}
          title={isZh ? '打开左侧消息与通话抽屉' : 'Open Communication Drawer'}
        >
          <MessageCircle className="h-3.5 w-3.5 opacity-80" />
          <span className="hidden sm:inline">{isZh ? '通信' : 'Chat'}</span>
          {unreadTotal > 0 && (
            <span
              className={`inline-flex min-w-[16px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-semibold ${
                isDay ? 'bg-[#2a3832] text-[#f7f4ee]' : 'bg-[#e8e1d2] text-[#17202b]'
              }`}
            >
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {/* Compact Garden-Blended Bottom AI Chat & Voice Bar */}
      {!immersive && <SpiritCommandBar lang={lang} />}
    </main>
  );
};
