import { type FC } from 'react';
import { cn } from '../../lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg';
type SkeletonVariant = 'text' | 'title' | 'avatar' | 'shimmer';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

interface SkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
}

export const Spinner: FC<SpinnerProps> = ({ size = 'md', className }) => {
  return (
    <span
      className={cn('spinner', `spinner-${size}`, className)}
      role="status"
      aria-label="Cargando..."
    />
  );
};

export const Skeleton: FC<SkeletonProps> = ({ variant = 'shimmer', count = 1, className }) => {
  const shimmerBase = 'bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200px_100%] animate-shimmer rounded';

  const variants: Record<SkeletonVariant, string> = {
    text: 'skeleton-text',
    title: 'skeleton-title',
    avatar: 'skeleton-avatar',
    shimmer: `${shimmerBase} h-4 w-full`,
  };

  if (count === 1) {
    return (
      <div className={cn(variants[variant], className)} role="status" aria-label="Cargando..." />
    );
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Cargando...">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(variants[variant], className)} />
      ))}
    </div>
  );
};
