import { Truck, Trash2, Phone, Pencil } from 'lucide-react';
import { Button, EmptyState } from '../../../common/components';
import type { Supplier } from '../../../specs/purchases';

interface SupplierListProps {
  suppliers: Supplier[];
  loading: boolean;
  isOwner: boolean;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string, name: string) => void;
}

export function SupplierList({ suppliers, loading, isOwner, onEdit, onDelete }: SupplierListProps) {
  if (loading && suppliers.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
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
      {suppliers.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-white"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Truck size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
              {s.phone && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Phone size={12} />
                  {s.phone}
                </p>
              )}
            </div>
          </div>
          {isOwner && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
                <Pencil size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(s.id, s.name)} className="text-danger">
                <Trash2 size={16} />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
