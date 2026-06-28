import { useState, useEffect } from 'react';
import { Truck, Trash2, Phone, Pencil, ShoppingCart, DollarSign } from 'lucide-react';
import { Button, Badge, EmptyState, Pagination, Tooltip } from '../../../common/components';
import type { Supplier } from '../../../specs/purchases';
import { getInitials } from '../../../lib/utils';
import { formatUsd } from '@/lib/formatBs';
import { PaySupplierModal } from './PaySupplierModal';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

interface SupplierListProps {
  suppliers: Supplier[];
  loading: boolean;
  isOwner: boolean;
  activeOrdersBySupplier?: Record<string, number>;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string, name: string) => void;
  tenantId: string;
}

const SUPPLIERS_PAGE_SIZE = 20;

export function SupplierList({ suppliers, loading, isOwner, activeOrdersBySupplier, onEdit, onDelete, tenantId }: SupplierListProps) {
  const [page, setPage] = useState(1);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [paySupplierId, setPaySupplierId] = useState<string | null>(null);
  const session = useAuthStore((s) => s.session);
  const canUpdate = hasActionPermission(session, 'purchases', 'update');
  const canDelete = hasActionPermission(session, 'purchases', 'delete');

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [loading, hasLoadedOnce]);

  useEffect(() => {
    setPage(1);
  }, [suppliers.length]);

  const totalPages = Math.max(1, Math.ceil(suppliers.length / SUPPLIERS_PAGE_SIZE));
  const pagedSuppliers = suppliers.slice((page - 1) * SUPPLIERS_PAGE_SIZE, page * SUPPLIERS_PAGE_SIZE);

  if (loading && suppliers.length === 0 && !hasLoadedOnce) {
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
        icon={<Truck size={32} className="icon-float" />}
        title="Todavía no hay proveedores"
        description="Agrega tu primer proveedor. Así podrás crear órdenes de compra rápido."
      />
    );
  }

  return (
    <div className="space-y-2 supplier-stagger">
      {pagedSuppliers.map((s) => {
        const activeOrders = activeOrdersBySupplier?.[s.id] ?? 0;
        const initials = getInitials(s.name);

        return (
          <div
            key={s.id}
            className="supplier-card-hover flex flex-col items-center gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5 rounded-xl border border-gray-100 bg-white transition-all duration-200"
            style={{ borderLeft: s.phone ? '3px solid transparent' : undefined }}
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0 flex-1 w-full text-center sm:text-left">
              <p className="text-sm font-semibold text-gray-900 wrap-break-word">{s.name}</p>
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {s.phone && (
                  <p className="text-xs text-text-secondary flex items-center gap-1">
                    <Phone size={12} className="shrink-0" />
                    <span className="wrap-break-word">{s.phone}</span>
                  </p>
                )}
                {activeOrders > 0 && (
                  <Badge variant="info" className="flex items-center gap-0.5 animate-badge-glow">
                    <ShoppingCart size={12} />
                    <span>{activeOrders}</span>
                  </Badge>
                )}
                {(s as any).balance > 0 ? (
                  <Badge variant="danger" dot>{formatUsd((s as any).balance)}</Badge>
                ) : (
                  <Badge variant="success">$0</Badge>
                )}
              </div>
            </div>
            {isOwner && (
              <div className="flex gap-1">
                {(s as any).balance > 0 && canUpdate && (
                  <Tooltip content="Pagar" variant="help">
                    <Button variant="primary" size="sm" onClick={() => setPaySupplierId(s.id)} className="p-1.5 min-w-8 min-h-8">
                      <DollarSign size={14} />
                    </Button>
                  </Tooltip>
                )}
                {canUpdate && (
                  <Tooltip content="Editar" variant="help">
                    <Button variant="ghost-primary" size="sm" onClick={() => onEdit(s)} className="p-1.5 min-w-8 min-h-8">
                      <Pencil size={14} />
                    </Button>
                  </Tooltip>
                )}
                {canDelete && (
                  <Tooltip content="Eliminar" variant="danger">
                    <Button variant="ghost-danger" size="sm" onClick={() => onDelete(s.id, s.name)} className="p-1.5 min-w-8 min-h-8">
                      <Trash2 size={14} />
                    </Button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      {paySupplierId && (
        <PaySupplierModal
          supplierId={paySupplierId}
          isOpen={!!paySupplierId}
          onClose={() => setPaySupplierId(null)}
          onSuccess={() => setPaySupplierId(null)}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
