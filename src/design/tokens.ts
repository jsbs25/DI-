export const oneTokens = {
  color: {
    deepSpace: '#05070B',
    graphite: '#0E131B',
    graphiteSoft: '#151B26',
    graphiteElevated: '#1B2230',
    moonlight: '#F4F3EE',
    silver: '#B7BDC8',
    silverDim: '#8892A3',
    iceBlue: '#7FD4FF',
    iceBlueSoft: 'rgba(127, 212, 255, 0.14)',
    warmGold: '#D7B676',
    warmGoldSoft: 'rgba(215, 182, 118, 0.14)',
    success: '#4CC38A',
    warning: '#E3B341',
    danger: '#E07A7A',
    border: 'rgba(244, 243, 238, 0.10)',
    borderStrong: 'rgba(244, 243, 238, 0.16)',
    overlay: 'rgba(5, 7, 11, 0.72)',
  },
  radius: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    pill: '999px',
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.18)',
    md: '0 2px 8px rgba(0,0,0,0.35), 0 20px 48px rgba(0,0,0,0.24)',
    lg: '0 8px 24px rgba(0,0,0,0.4), 0 40px 80px rgba(0,0,0,0.28)',
  },
  motion: {
    fast: '140ms',
    base: '220ms',
    slow: '360ms',
    ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  layout: {
    navHeight: '64px',
    dockWidth: '84px',
    contentMax: '1440px',
  },
} as const;

export type OneTokens = typeof oneTokens;
