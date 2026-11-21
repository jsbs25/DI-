import React from 'react';
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
  onSelectTab,
  immersive = false,
  onImmersiveChange,
}) => {
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-gradient-to-b from-[#17365c] via-[#1f4859] to-[#23402e]">
      <ParadiseWorld3D
        lang={lang}
        onSelectTab={onSelectTab}
        immersive={immersive}
        onImmersiveChange={onImmersiveChange}
      />
    </main>
  );
};


