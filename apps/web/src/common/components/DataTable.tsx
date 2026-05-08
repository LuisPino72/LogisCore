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
}: DataTableProps<T>) {
  if (loading) return <Skeleton variant="text" count={5} />;

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
        className="data-table-header"
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((col) => (
          <div key={col.key} className={cn('data-table-cell font-semibold', col.className)}>
            {col.header}
          </div>
        ))}
      </div>
      {data.map((item) => (
        <div
          key={keyExtractor(item)}
          className="data-table-row"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
          onClick={() => onRowClick?.(item)}
          role={onRowClick ? 'button' : undefined}
          tabIndex={onRowClick ? 0 : undefined}
        >
          {columns.map((col) => (
            <div key={col.key} className={cn('data-table-cell', col.className)}>
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