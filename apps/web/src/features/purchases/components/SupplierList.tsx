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
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-xl border border-border bg-white transition-shadow hover:shadow-sm"
          >
            <div className="flex items-center gap-3 min-w-0 w-full">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Truck size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                <div className="flex items-center gap-2">
                  {s.phone && (
                    <p className="text-xs text-text-secondary flex items-center gap-1">
                      <Phone size={12} />
                      {s.phone}
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
            </div>
            {isOwner && (
              <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-end">
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
