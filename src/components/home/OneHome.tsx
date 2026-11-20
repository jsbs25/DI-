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
import { LivingGarden } from '../../world/LivingGarden.tsx';

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
  commsActive?: boolean;
};

export const OneHome: React.FC<Props> = ({ lang, onSelectTab, immersive = false, commsActive = false }) => {
  return (
    <LivingGarden
      lang={lang}
      currentTab="globe"
      commsActive={commsActive}
      onSelectTab={onSelectTab}
      immersive={immersive}
    />
  );
};
