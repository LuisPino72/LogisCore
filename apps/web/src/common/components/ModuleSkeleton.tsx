import { type FC } from 'react';
import { Skeleton } from './Loading';

export const ModuleSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <Skeleton variant="shimmer" className="h-8 w-8 rounded-lg" />
        <Skeleton variant="shimmer" className="h-5 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Skeleton variant="shimmer" className="h-28 rounded-xl" />
        <Skeleton variant="shimmer" className="h-28 rounded-xl" />
      </div>
      <Skeleton variant="shimmer" className="h-48 rounded-xl" />
      <Skeleton variant="shimmer" className="h-36 rounded-xl" />
    </div>
  );
};
