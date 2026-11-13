import React from 'react';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'base' | 'elevated' | 'subtle';
};

export function Surface({ variant = 'base', className = '', ...props }: Props) {
  const v =
    variant === 'elevated'
      ? 'one-surface-elevated'
      : variant === 'subtle'
      ? 'one-surface-subtle'
      : 'one-surface';
  return <div className={`${v} ${className}`.trim()} {...props} />;
}
