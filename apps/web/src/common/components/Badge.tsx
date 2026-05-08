import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export const Badge: FC<BadgeProps> = ({ variant = 'neutral', children, className }) => {
  return <span className={cn('badge-' + variant, className)}>{children}</span>;
};