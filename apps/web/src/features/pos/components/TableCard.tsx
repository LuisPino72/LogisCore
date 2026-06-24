import { memo } from 'react';
import { Clock, ShoppingBag } from 'lucide-react';
import { formatUsd } from '@/lib/formatBs';

interface TableCardProps {
  number: number;
  isOccupied: boolean;
  totalUsd?: number;
  totalItems?: number;
  time?: string;
  onClick: () => void;
  onDelete?: () => void;
}

export const TableCard = memo(function TableCard({ number, isOccupied, totalUsd, totalItems, time, onClick, onDelete }: TableCardProps) {
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onDelete?.(); }}
      className={`relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 min-h-[88px] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
        isOccupied
          ? 'border-primary/40 bg-primary/4 hover:bg-primary/8 hover:shadow-md hover:scale-[1.02] cursor-pointer shadow-xs'
          : 'border-emerald-200/60 bg-white hover:bg-emerald-50/50 hover:border-emerald-300/80 hover:shadow-sm cursor-pointer border-dashed'
      }`}
      aria-label={isOccupied ? `Mesa ${number} ocupada` : `Mesa ${number} libre`}
    >
      <span className={`text-lg font-bold ${isOccupied ? 'text-primary' : 'text-emerald-600'}`}>
        {number}
      </span>
      {isOccupied ? (
        <>
          <span className="text-xs font-semibold text-gray-800 leading-tight">
            {formatUsd(totalUsd ?? 0)}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Clock size={10} />
            <span>{time}</span>
            <span className="text-gray-300">·</span>
            <ShoppingBag size={10} />
            <span>{totalItems}</span>
          </div>
          <div className="absolute top-1.5 right-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </>
      ) : (
        <span className="text-[10px] text-emerald-500 font-medium">Libre</span>
      )}
    </button>
  );
});
