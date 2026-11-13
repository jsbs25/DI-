import React from 'react';

type Props = React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'gold' };

export function Badge({ tone = 'neutral', className = '', ...props }: Props) {
  const t = tone === 'accent' ? 'one-badge-accent' : tone === 'gold' ? 'one-badge-gold' : 'one-badge-neutral';
  return <span className={`one-badge ${t} ${className}`.trim()} {...props} />;
}
