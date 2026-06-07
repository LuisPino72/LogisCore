import { useEffect, useState } from 'react';
import { Modal, Button, Badge, EmptyState, Spinner, Pagination } from '../../../common/components';
import { Users, Phone, MapPin, DollarSign, ShoppingBag, TrendingUp, IdCard } from 'lucide-react';
import type { Customer } from '../../../specs/customers';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { useCustomerStore } from '../stores/customerStore';

const HISTORY_PAGE_SIZE = 20;

interface CustomerDetailModalProps {
  customer: Customer | null;
  isOpen: boolean;
  tenantId: string;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
  canEdit?: boolean;
}

export function CustomerDetailModal({ customer, isOpen, tenantId, onClose, onEdit, canEdit = false }: CustomerDetailModalProps) {
  const [page, setPage] = useState(1);
  const history = useCustomerStore((s) => s.history);
  const historyTotal = useCustomerStore((s) => s.historyTotal);
  const historyLoading = useCustomerStore((s) => s.historyLoading);
  const stats = useCustomerStore((s) => s.stats);
  const fetchHistory = useCustomerStore((s) => s.fetchCustomerHistory);
  const fetchStats = useCustomerStore((s) => s.fetchCustomerStats);
  const reset = useCustomerStore((s) => s.reset);

  useEffect(() => {
    if (isOpen && customer) {
      fetchStats(customer.id, tenantId);
      fetchHistory({ customerId: customer.id, limit: HISTORY_PAGE_SIZE, offset: 0 }, tenantId);
      setPage(1);
    }
    return () => {
      if (!isOpen) reset();
    };
  }, [isOpen, customer, tenantId, fetchHistory, fetchStats, reset]);

  if (!customer) return null;

  const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchHistory(
      { customerId: customer.id, limit: HISTORY_PAGE_SIZE, offset: (newPage - 1) * HISTORY_PAGE_SIZE },
      tenantId,
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Detalle del cliente"
      footer={
        <div className="flex gap-2 w-full">
          {canEdit && onEdit && (
            <Button variant="primary" className="flex-1" onClick={() => onEdit(customer)}>
              Editar
            </Button>
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-linear-to-br from-primary/5 to-primary/10 border border-primary/20">
          <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm ring-1 ring-primary/10">
            <Users size={28} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900 wrap-break-word">{customer.name}</h3>
            <div className="flex flex-col gap-1 mt-1.5">
              {customer.cedula && ( // AUDIT-017: Cédula field V/E/J/P + 6-8 digits
                <p className="text-xs text-text-secondary flex items-center gap-1.5 font-mono">
                  <IdCard size={12} className="shrink-0" />
                  <span className="wrap-break-word">{customer.cedula}</span>
                </p>
              )}
              {customer.phone && (
                <p className="text-xs text-text-secondary flex items-center gap-1.5">
                  <Phone size={12} className="shrink-0" />
                  <span className="wrap-break-word">{customer.phone}</span>
                </p>
              )}
              {customer.address && (
                <p className="text-xs text-text-secondary flex items-center gap-1.5">
                  <MapPin size={12} className="shrink-0" />
                  <span className="wrap-break-word">{customer.address}</span>
                </p>
              )}
              {customer.notes && (
                <p className="text-xs text-text-secondary italic mt-1">{customer.notes}</p>
              )}
            </div>
          </div>
          {(customer.creditLimit ?? 0) > 0 && (
            <Badge variant="info" className="shrink-0">
              Crédito: {formatUsd(customer.creditLimit ?? 0)}
            </Badge>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Resumen de compras
          </h4>
          {stats ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-primary/10 p-3 text-center">
                <DollarSign size={16} className="text-primary mx-auto mb-1" />
                <p className="text-xs text-text-secondary">Total gastado</p>
                <p className="text-base sm:text-lg font-bold text-primary">{formatUsd(stats.totalSpentUsd)}</p>
                <p className="text-[10px] text-text-secondary">{formatBs(stats.totalSpentBs)}</p>
              </div>
              <div className="rounded-xl border border-info/20 bg-linear-to-br from-info/5 to-info/10 p-3 text-center">
                <ShoppingBag size={16} className="text-info mx-auto mb-1" />
                <p className="text-xs text-text-secondary">Compras</p>
                <p className="text-base sm:text-lg font-bold text-info">{stats.purchaseCount}</p>
                <p className="text-[10px] text-text-secondary">transacciones</p>
              </div>
              <div className="rounded-xl border border-accent/20 bg-linear-to-br from-accent/5 to-accent/10 p-3 text-center">
                <TrendingUp size={16} className="text-accent mx-auto mb-1" />
                <p className="text-xs text-text-secondary">Ticket prom.</p>
                <p className="text-base sm:text-lg font-bold text-accent">{formatUsd(stats.averageTicketUsd)}</p>
                <p className="text-[10px] text-text-secondary">por compra</p>
              </div>
            </div>
          ) : historyLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Historial ({historyTotal})
            </h4>
          </div>

          {historyLoading && history.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={32} />}
              title="Sin compras registradas"
              description="Cuando este cliente compre, sus ventas aparecerán aquí."
            />
          ) : (
            <>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">
                        {new Date(sale.createdAt).toLocaleString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {sale.paymentMethod === 'efectivo_bs' ? 'Efectivo Bs' :
                          sale.paymentMethod === 'efectivo_usd' ? 'Efectivo USD' :
                          sale.paymentMethod === 'pago_movil' ? 'Pago Móvil' : 'Tarjeta'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatBs(sale.totalBs)}</p>
                      <p className="text-[10px] text-text-secondary">
                        {/* PLAN-112 (C2): subtotalBs sin impuestos (DINERO-020) */}
                        {formatUsd(sale.exchangeRate > 0 ? sale.subtotalBs / sale.exchangeRate : 0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-3">
                  <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
