import { cn } from '../../lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-2 py-3 text-sm text-gray-600">
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="btn btn-sm btn-secondary disabled:opacity-30 min-w-11 min-h-11 flex items-center justify-center"
          aria-label="Página anterior"
        >
          ‹
        </button>
        {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 1, totalPages - 3));
          const p = start + i;
          if (p > totalPages) return null;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'btn btn-sm min-w-[44px] inline-flex items-center justify-center sm:inline-flex',
                p === page ? 'btn-primary' : 'btn-ghost',
              )}
            >
              {p}
            </button>
          );
        })}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="btn btn-sm btn-secondary disabled:opacity-30 min-w-11 min-h-11 flex items-center justify-center"
          aria-label="Página siguiente"
        >
          ›
        </button>
      </div>
    </div>
  );
}
