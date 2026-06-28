import { useState, useEffect } from 'react';
import { Users, Phone, MapPin, Pencil, Trash2, CreditCard, History, IdCard, Clock, AlertTriangle } from 'lucide-react';
import { Button, Badge, EmptyState, Pagination, Tooltip } from '../../../common/components';
import type { Customer } from '../../../specs/customers';
import { getInitials, formatTimeAgo, formatPhone } from '../../../lib/utils';
import { formatUsd } from '@/lib/formatBs';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

const PAGE_SIZE = 20;

interface CustomerListProps {
  customers: Customer[];
  loading: boolean;
  isOwner: boolean;
  onEdit: (customer: Customer) => void;
  onDelete: (id: string, name: string) => void;
  onViewHistory: (customer: Customer) => void;
}

export function CustomerList({ customers, loading, isOwner, onEdit, onDelete, onViewHistory }: CustomerListProps) {
  const [page, setPage] = useState(1);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const session = useAuthStore((s) => s.session);
  const canUpdate = hasActionPermission(session, 'customers', 'update');
  const canDelete = hasActionPermission(session, 'customers', 'delete');

  useEffect(() => {
    if (!loading && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [loading, hasLoadedOnce]);

  useEffect(() => {
    setPage(1);
  }, [customers.length]);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const pagedCustomers = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading && customers.length === 0 && !hasLoadedOnce) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="customer-skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={<Users size={32} />}
        title="Todavía no hay clientes"
        description="Agrega tu primer cliente. Así podrás asociarlo a tus ventas y ver el historial de compras."
      />
    );
  }

  return (
    <div className="space-y-2 customer-stagger">
      {pagedCustomers.map((c) => {
        const initials = getInitials(c.name);
        const hasCredit = (c.creditLimit ?? 0) > 0;

        return (
          <div
            key={c.id}
            className="customer-item-hover flex flex-col items-center gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5 rounded-xl border border-gray-100 bg-white sm:hover:shadow-sm sm:hover:border-primary/20 sm:group transition-all duration-200 sm:hover:border-l-primary sm:hover:border-l-3"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-2 ring-primary/20 customer-avatar">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0 flex-1 w-full text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start sm:flex-row flex-col">
                <p className="text-sm font-semibold text-gray-900 wrap-break-word">{c.name}</p>
                {hasCredit && (
                  <Badge variant="info" className="flex items-center gap-0.5 customer-badge">
                    <CreditCard size={10} />
                    <span>Con crédito</span>
                  </Badge>
                )}
                {(c.balance ?? 0) > 0 && (
                  <Badge variant="warning" className="flex items-center gap-0.5 customer-badge">
                    <AlertTriangle size={10} />
                    <span>Debe {formatUsd(c.balance)}</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 sm:justify-start sm:flex-row flex-col">
                {c.cedula && ( // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
                  <p className="text-xs text-text-secondary flex items-center gap-1 font-mono">
                    <IdCard size={12} className="shrink-0" />
                    <span className="wrap-break-word">{c.cedula}</span>
                  </p>
                )}
                {c.phone && (
                  <p className="text-xs text-text-secondary flex items-center gap-1">
                    <Phone size={12} className="shrink-0" />
                    <span className="wrap-break-word">{formatPhone(c.phone || '')}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Última compra: {formatTimeAgo(c.lastPurchaseAt ?? null)}</span>
                </div>
                {c.address && (
                  <p className="text-xs text-text-secondary flex items-center gap-1">
                    <MapPin size={12} className="shrink-0" />
                    <span className="wrap-break-word">{c.address}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <Tooltip content="Ver historial" variant="help" position="top">
                <Button
                  variant="ghost-primary"
                  size="sm"
                  onClick={() => onViewHistory(c)}
                  className="p-1.5 min-w-11 min-h-11"
                >
                  <History size={14} />
                </Button>
              </Tooltip>
              {isOwner && (
                <>
                  {canUpdate && (
                    <Tooltip content="Editar" variant="help" position="top">
                      <Button
                        variant="ghost-accent"
                        size="sm"
                        onClick={() => onEdit(c)}
                        className="p-1.5 min-w-11 min-h-11"
                      >
                        <Pencil size={14} />
                      </Button>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Tooltip content="Eliminar" variant="danger" position="top">
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => onDelete(c.id, c.name)}
                        className="p-1.5 min-w-11 min-h-11"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
