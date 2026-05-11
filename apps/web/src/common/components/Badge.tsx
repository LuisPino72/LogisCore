import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export const Badge: FC<BadgeProps> = ({ variant = 'neutral', children, dot, className }) => {
  return (
    <span className={cn('badge', 'badge-' + variant, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-60" />}
      {children}
    </span>
  );
};
