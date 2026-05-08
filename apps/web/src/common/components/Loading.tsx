import { type FC } from 'react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface SkeletonProps {
  variant?: 'text' | 'title' | 'avatar';
  count?: number;
  className?: string;
}

export const Spinner: FC<SpinnerProps> = ({ size = 'md', className }) => {
  return <span className={cn('spinner', 'spinner-' + size, className)} />;
};

export const Skeleton: FC<SkeletonProps> = ({ variant = 'text', count = 1, className }) => {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Cargando...">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('skeleton-' + variant, className)} />
      ))}
    </div>
  );
};