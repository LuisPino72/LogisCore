import { AlertTriangle } from 'lucide-react';

interface LowStockBadgeProps {
  count: number;
}

export function LowStockBadge({ count }: LowStockBadgeProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 text-danger text-[10px] font-semibold">
      <AlertTriangle size={12} />
      <span>{count} bajo stock</span>
    </div>
  );
}
