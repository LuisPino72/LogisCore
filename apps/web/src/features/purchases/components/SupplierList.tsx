import { useState, useEffect } from 'react';
import { Truck, Trash2, Phone, Pencil, ShoppingCart } from 'lucide-react';
import { Button, Badge, EmptyState, Pagination } from '../../../common/components';
import type { Supplier } from '../../../specs/purchases';

interface SupplierListProps {
  suppliers: Supplier[];
  loading: boolean;
  isOwner: boolean;
  activeOrdersBySupplier?: Record<string, number>;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string, name: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const SUPPLIERS_PAGE_SIZE = 20;

export function SupplierList({ suppliers, loading, isOwner, activeOrdersBySupplier, onEdit, onDelete }: SupplierListProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [suppliers.length]);

  const totalPages = Math.max(1, Math.ceil(suppliers.length / SUPPLIERS_PAGE_SIZE));
  const pagedSuppliers = suppliers.slice((page - 1) * SUPPLIERS_PAGE_SIZE, page * SUPPLIERS_PAGE_SIZE);

  if (loading && suppliers.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={<Truck size={32} />}
        title="Sin proveedores"
        description="Agrega tu primer proveedor para crear órdenes de compra."
      />
    );
  }

  return (
    <div className="space-y-2">
      {pagedSuppliers.map((s) => {
        const activeOrders = activeOrdersBySupplier?.[s.id] ?? 0;
        const initials = getInitials(s.name);

        return (
          <div
            key={s.id}
            className="flex flex-col items-center gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5 rounded-xl border border-gray-100 bg-white sm:hover:shadow-sm sm:hover:border-primary/20 sm:group transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0 flex-1 w-full text-center sm:text-left">
              <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {s.phone && (
                  <p className="text-xs text-text-secondary flex items-center gap-1 truncate">
                    <Phone size={12} className="shrink-0" />
                    <span className="truncate">{s.phone}</span>
                  </p>
                )}
                {activeOrders > 0 && (
                  <Badge variant="info" className="flex items-center gap-0.5">
                    <ShoppingCart size={10} />
                    <span>{activeOrders}</span>
                  </Badge>
                )}
              </div>
            </div>
            {isOwner && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(s)} className="p-1.5 min-w-8 min-h-8" title="Editar">
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(s.id, s.name)} className="p-1.5 min-w-8 min-h-8 text-danger" title="Eliminar">
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
