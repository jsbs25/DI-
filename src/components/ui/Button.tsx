import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: Props) {
  const base = 'one-btn';
  const v = variant === 'primary' ? 'one-btn-primary' : variant === 'ghost' ? 'one-btn-ghost' : 'one-btn-secondary';
  const s = size === 'sm' ? 'one-btn-sm' : 'one-btn-md';
  return <button className={`${base} ${v} ${s} ${className}`.trim()} {...props} />;
}
