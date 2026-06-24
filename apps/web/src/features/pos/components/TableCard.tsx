import { memo } from 'react';
import { Clock, ShoppingBag, Trash2 } from 'lucide-react';
import { formatUsd } from '@/lib/formatBs';

interface TableCardProps {
  number: number;
  isOccupied: boolean;
  isSelected?: boolean;
  totalUsd?: number;
  totalItems?: number;
  time?: string;
  onClick: () => void;
  onDelete?: () => void;
}

export const TableCard = memo(function TableCard({ number, isOccupied, isSelected, totalUsd, totalItems, time, onClick, onDelete }: TableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onDelete?.(); }}
      className={`relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 min-h-[88px] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-danger/50 ${
        isSelected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
          : isOccupied
            ? 'border-danger/60 bg-danger/5 hover:bg-danger/10 hover:shadow-md hover:scale-[1.02] cursor-pointer shadow-xs'
            : 'border-emerald-200/60 bg-white hover:bg-emerald-50/50 hover:border-emerald-300/80 hover:shadow-sm cursor-pointer border-dashed'
      }`}
      aria-label={isOccupied ? `Mesa ${number} ocupada` : isSelected ? `Mesa ${number} seleccionada` : `Mesa ${number} libre`}
    >
      <span className={`text-lg font-bold ${isSelected ? 'text-primary' : isOccupied ? 'text-danger' : 'text-emerald-600'}`}>
        {number}
      </span>
      {isOccupied ? (
        <>
          <span className="text-xs font-semibold text-gray-800 leading-tight">
            {formatUsd(totalUsd ?? 0)}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Clock size={10} />
            <span>{time}</span>
            <span className="text-gray-300">·</span>
            <ShoppingBag size={10} />
            <span>{totalItems}</span>
          </div>
          <div className="absolute top-1.5 right-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label={`Eliminar mesa ${number}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      ) : (
        <span className={`text-[11px] font-medium ${isSelected ? 'text-primary' : 'text-emerald-500'}`}>
          {isSelected ? 'Seleccionada' : 'Libre'}
        </span>
      )}
    </button>
  );
});
