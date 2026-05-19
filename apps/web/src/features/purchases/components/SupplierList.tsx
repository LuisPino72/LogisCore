import { Truck, Trash2, Phone, Pencil, ShoppingCart } from 'lucide-react';
import { Button, Badge, EmptyState } from '../../../common/components';
import type { Supplier } from '../../../specs/purchases';

interface SupplierListProps {
  suppliers: Supplier[];
  loading: boolean;
  isOwner: boolean;
  activeOrdersBySupplier?: Record<string, number>;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string, name: string) => void;
}

export function SupplierList({ suppliers, loading, isOwner, activeOrdersBySupplier, onEdit, onDelete }: SupplierListProps) {
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
      {suppliers.map((s) => {
        const activeOrders = activeOrdersBySupplier?.[s.id] ?? 0;

        return (
          <div
            key={s.id}
            className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 pt-8 rounded-xl border border-border bg-white transition-shadow hover:shadow-sm"
          >
            <div className="absolute top-1.5 left-2 w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Truck size={14} className="text-primary" />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
                <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
                  <Pencil size={16} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(s.id, s.name)} className="text-danger">
                  <Trash2 size={16} />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
