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
  onSelectTab,
  immersive = false,
  onImmersiveChange,
}) => {
  const isZh = lang === 'zh';
  const snap = useAgentUiState();
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0e1928]">
      <ParadiseWorld3D
        lang={lang}
        immersive={immersive}
        onImmersiveChange={onImmersiveChange}
      />

      {/* Sleek Left Communication Entry (opens persistent Messenger Slide-Over Drawer without leaving Garden) */}
      {!immersive && !snap.commDrawerOpen && (
        <button
          type="button"
          onClick={() => uiStateManager.setCommDrawerOpen(true)}
          data-testid="left-comm-entry"
          className="pointer-events-auto fixed left-3 top-[calc(3.85rem+env(safe-area-inset-top))] md:top-1/2 md:-translate-y-1/2 z-30 inline-flex items-center gap-2 rounded-xl border border-white/16 bg-[#0c1420]/90 px-3 py-2.5 text-xs font-medium text-slate-100 shadow-xl hover:bg-[#152033] hover:text-white transition-colors cursor-pointer"
          title={isZh ? '打开左侧消息与通话抽屉' : 'Open Communication Drawer'}
        >
          <MessageCircle className="h-4 w-4 text-sky-300" />
          <span className="hidden sm:inline">{isZh ? '通信' : 'Chat'}</span>
          {unreadTotal > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {/* Bottom-Center Spirit Wake & Natural Command Bar */}
      {!immersive && (
        <SpiritCommandBar
          lang={lang}
          onOpenSpaces={() => onSelectTab('universe')}
        />
      )}
    </main>
  );
};
