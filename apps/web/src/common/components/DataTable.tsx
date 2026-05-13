import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Loading';
import { EmptyState } from './EmptyState';
import { Package } from 'lucide-react';
import { Card } from './Card';

export interface Column<T> {
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
  renderCardOnMobile?: boolean;
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
  // new prop: when true, DataTable will render rows as cards on small screens
  renderCardOnMobile,
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
    <div className={cn('data-table', className)} style={{ ['--cols' as unknown as string]: `repeat(${columns.length}, minmax(0,1fr))` } as React.CSSProperties}>
      {/* Desktop / Tablet header */}
      <div className={cn('data-table-header hidden sm:grid', stickyHeader && 'sticky top-0 z-10')}>
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

      {/* Desktop / Tablet rows */}
      <div className="hidden sm:block">
        {data.map((item, index) => (
          <div
            key={keyExtractor(item)}
            className={cn(
              'data-table-row',
              index % 2 === 0 && 'bg-white',
              index % 2 !== 0 && 'bg-gray-50/50',
              onRowClick && 'cursor-pointer',
            )}
            onClick={() => onRowClick?.(item)}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(item); } : undefined}
          >
            {columns.map((col) => {
              const content = col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '');
              return (
                <div key={col.key} className={cn('data-table-cell', col.hideOnMobile && 'hidden sm:flex', col.className)}>
                  {content}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Mobile: explicit Card per row for readability */}
      {renderCardOnMobile && (
        <div className="sm:hidden">
        {data.map((item) => {
          const primary = columns[0];
          const primaryContent = primary.render ? primary.render(item) : String((item as Record<string, unknown>)[primary.key] ?? '');
          return (
            <Card key={keyExtractor(item)} className="mb-3">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 truncate">{primaryContent}</div>
                </div>
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  {columns.slice(1).map((col) => {
                    if (col.hideOnMobile) return null;
                    const content = col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '');
                    if (col.key === 'actions') {
                      return <div key={col.key} className="mt-2 flex items-center gap-2">{content}</div>;
                    }
                    return (
                      <div key={col.key} className="flex items-start gap-2">
                        <div className="text-gray-500 w-16 sm:w-24 text-xs">{col.header}</div>
                        <div className="text-gray-800 truncate text-sm">{content}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
        </div>
      )}
    </div>
  );
}
