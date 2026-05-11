import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Loading';
import { EmptyState } from './EmptyState';
import { Package } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string;
  className?: string;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage,
  emptyIcon,
  onRowClick,
  keyExtractor,
  className,
  stickyHeader,
}: DataTableProps<T>) {
  if (loading) return <Skeleton variant="shimmer" count={5} />;

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <Package size={48} />}
        title={emptyMessage ?? 'Sin datos'}
        description="No hay registros para mostrar"
      />
    );
  }

  return (
    <div className={cn('data-table', className)}>
      <div
        className={cn(
          'data-table-header',
          stickyHeader && 'sticky top-0 z-10',
        )}
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((col) => (
          <div key={col.key} className={cn('data-table-cell font-semibold', col.className)}>
            {col.sortable ? (
              <button className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                {col.header}
                <svg width="12" height="12" viewBox="0 0 12 12" className="text-gray-400">
                  <path d="M6 2L2 7h8L6 2zM6 10L2 5h8L6 10z" fill="currentColor" />
                </svg>
              </button>
            ) : (
              col.header
            )}
          </div>
        ))}
      </div>
      {data.map((item, index) => (
        <div
          key={keyExtractor(item)}
          className={cn(
            'data-table-row',
            index % 2 === 0 && 'bg-white',
            index % 2 !== 0 && 'bg-gray-50/50',
            onRowClick && 'cursor-pointer',
          )}
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
          onClick={() => onRowClick?.(item)}
          role={onRowClick ? 'button' : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(item); } : undefined}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                'data-table-cell',
                col.hideOnMobile && 'hidden sm:flex',
                col.className,
              )}
            >
              {col.render
                ? col.render(item)
                : String((item as Record<string, unknown>)[col.key] ?? '')}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
