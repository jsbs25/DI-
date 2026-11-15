export const oneTokens = {
  color: {
    deepSpace: '#F4F7FB',
    graphite: '#FFFFFF',
    graphiteSoft: '#EEF3FA',
    graphiteElevated: '#FFFFFF',
    moonlight: '#0F172A',
    silver: '#475569',
    silverDim: '#64748B',
    iceBlue: '#0284C7',
    iceBlueSoft: 'rgba(2, 132, 199, 0.12)',
    warmGold: '#B45309',
    warmGoldSoft: 'rgba(180, 83, 9, 0.11)',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    border: 'rgba(15, 23, 42, 0.10)',
    borderStrong: 'rgba(15, 23, 42, 0.18)',
    overlay: 'rgba(244, 247, 251, 0.85)',
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
    sm: '0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.06)',
    md: '0 2px 8px rgba(15,23,42,0.06), 0 18px 42px rgba(15,23,42,0.08)',
    lg: '0 8px 24px rgba(15,23,42,0.08), 0 32px 64px rgba(15,23,42,0.12)',
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
