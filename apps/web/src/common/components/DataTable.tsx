import { type ReactNode, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Loading';
import { EmptyState } from './EmptyState';
import { Package, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from './Card';
import { Pagination } from './Pagination';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  hideOnMobile?: boolean;
  hideLabelOnMobile?: boolean;
  className?: string;
}

export type SortDirection = 'asc' | 'desc';

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
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  rowClassName?: (item: T) => string | undefined;
}

const PAGE_SIZE_DEFAULT = 20;

interface DataRowProps<T> {
  item: T;
  columns: Column<T>[];
  index: number;
  onRowClick?: (item: T) => void;
  className?: string;
}

const DataRow = <T,>(props: DataRowProps<T>): ReactNode => {
  const { item, columns, index, onRowClick, className } = props;
  return (
    <div
      className={cn(
        'data-table-row',
        index % 2 === 0 && 'bg-white',
        index % 2 !== 0 && 'bg-gray-50/50',
        onRowClick && 'cursor-pointer',
        className,
      )}
      onClick={() => onRowClick?.(item)}
      role={onRowClick ? 'button' : 'row'}
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(item); } : undefined}
    >
      {columns.map((col) => {
        const content = col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '');
        return (
          <div key={col.key} role="cell" className={cn('data-table-cell', col.hideOnMobile && 'hidden sm:flex', col.className)}>
            {content}
          </div>
        );
      })}
    </div>
  );
};

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
  renderCardOnMobile,
  page = 1,
  pageSize,
  total,
  onPageChange,
  sortKey,
  sortDirection,
  onSort,
  rowClassName,
}: DataTableProps<T>) {
  const currentPageSize = pageSize ?? PAGE_SIZE_DEFAULT;

  const sorted = useMemo(() => {
    if (!sortKey || !sortDirection) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [data, sortKey, sortDirection]);

  const totalItems = total ?? sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / currentPageSize));
  const start = (page - 1) * currentPageSize;
  const end = start + currentPageSize;
  const paged = onPageChange ? sorted.slice(start, end) : sorted;

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key);
    }
  };

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
    <div role="table" className={cn('data-table', className)} style={{ ['--cols' as unknown as string]: `repeat(${columns.length}, minmax(0,1fr))` } as React.CSSProperties}>
      {/* Desktop / Tablet header */}
      <div role="rowgroup" className={cn('data-table-header hidden sm:grid', stickyHeader && 'sticky top-0 z-10')}>
        {columns.map((col) => (
          <div key={col.key} role="columnheader" className={cn('data-table-cell font-semibold', col.className)}>
            {col.sortable ? (
              <button
                className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                onClick={() => handleSort(col.key)}
              >
                {col.header}
                {sortKey === col.key ? (
                  sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                ) : (
                  <ChevronDown size={12} className="text-gray-300" />
                )}
              </button>
            ) : (
              col.header
            )}
          </div>
        ))}
      </div>

       {/* Desktop / Tablet rows */}
      <div role="rowgroup" className="hidden sm:block">
        {paged.map((item, index) => (
          <DataRow
            key={keyExtractor(item)}
            item={item}
            columns={columns}
            index={index}
            onRowClick={onRowClick}
            className={rowClassName?.(item)}
          />
        ))}
      </div>

      {/* Mobile: explicit Card per row for readability */}
      {renderCardOnMobile && (
        <div className="sm:hidden pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        {paged.map((item) => {
          const imageCol = columns.find(col => col.key === 'image');
          const nameCol = columns.find(col => col.key === 'name');
          const imageContent = imageCol?.render ? imageCol.render(item) : null;
          const nameContent = nameCol?.render ? nameCol.render(item) : String((item as Record<string, unknown>)[nameCol?.key ?? ''] ?? '');
          return (
            <Card key={keyExtractor(item)} className={cn('mb-3', rowClassName?.(item))}>
              <div className="card-body">
                <div className="flex flex-col items-center gap-3">
                  {imageContent && (
                    <div className="w-28 h-28 mx-auto rounded-lg overflow-hidden bg-gray-100 *:w-full *:h-full">
                      {imageContent}
                    </div>
                  )}  
                  <div className="text-sm font-semibold text-gray-900 text-center w-full wrap-break-word">{nameContent}</div>
                </div>
                <div className="mt-2 text-xs text-gray-600 space-y-1 flex flex-col items-center">
                  {columns.map((col) => {
                    if (col.hideOnMobile || col.key === 'image' || col.key === 'name') return null;
                    const content = col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '');
                    if (col.key === 'actions') {
                      return <div key={col.key} className="mt-2 flex items-center justify-center gap-0.5">{content}</div>;
                    }
                    return (
                      <div key={col.key} className="flex items-center justify-center gap-2">
                        {!col.hideLabelOnMobile && (
                          <div className="text-gray-500 text-xs">{col.header}</div>
                        )}
                        <div className={cn('text-gray-800 wrap-break-word text-sm', col.hideLabelOnMobile && 'w-full text-center')}>{content}</div>
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

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </div>
  );
}
