import { AlertTriangle } from 'lucide-react';

interface LowStockBadgeProps {
  count: number;
  onClick?: () => void;
}

export function LowStockBadge({ count, onClick }: LowStockBadgeProps) {
  if (count === 0) return null;

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-full bg-danger/10 text-danger text-xs font-semibold transition-all duration-300 hover:bg-danger/20 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <AlertTriangle size={12} />
      <span>{count} <span className="hidden sm:inline">producto{count !== 1 ? 's' : ''} </span>con stock bajo</span>
    </div>
  );
}
