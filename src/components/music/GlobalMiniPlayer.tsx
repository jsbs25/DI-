import React from 'react';
import type { Language } from '../../types/index.ts';

type Props = {
  lang: Language;
  currentTab: string;
  onOpenMusic: () => void;
};

/**
 * Global audio playback is owned by PlayerProvider (singleton engine) so music keeps
 * playing in the background when the user navigates away from the Music space.
 * The mini-player UI is intentionally hidden: playback is resumed/controlled by
 * reopening Music, and stopped explicitly via the floating AI assistant (or Music stop).
 */
export const GlobalMiniPlayer: React.FC<Props> = () => {
  return null;
};
