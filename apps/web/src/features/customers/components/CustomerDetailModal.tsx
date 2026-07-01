import { useEffect, useState, memo } from 'react';
import { Modal, Button, Badge, EmptyState, Spinner, Pagination, SaleDetailModal, Tooltip } from '../../../common/components';
import { Users, Phone, MapPin, DollarSign, ShoppingBag, TrendingUp, IdCard, CreditCard, Calendar, Send } from 'lucide-react';
import type { Customer } from '../../../specs/customers';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { useCustomerStore } from '../stores/customerStore';
import { formatTimeAgo, formatPhone } from '../../../lib/utils';
import { PaymentModal } from './PaymentModal';
import { generateMenuText, normalizeWaPhone } from '../../pos/services/receiptService';
import { logger } from '../../../lib/logger';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';

const HISTORY_PAGE_SIZE = 20;

interface CustomerDetailModalProps {
  customer: Customer | null;
  isOpen: boolean;
  tenantId: string;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
  onRefresh?: () => void;
}

export const CustomerDetailModal = memo(function CustomerDetailModal({ customer, isOpen, tenantId, onClose, onEdit, onRefresh }: CustomerDetailModalProps) {
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const history = useCustomerStore((s) => s.history);
  const historyTotal = useCustomerStore((s) => s.historyTotal);
  const historyLoading = useCustomerStore((s) => s.historyLoading);
  const stats = useCustomerStore((s) => s.stats);
  const fetchHistory = useCustomerStore((s) => s.fetchCustomerHistory);
  const fetchStats = useCustomerStore((s) => s.fetchCustomerStats);
  const resetModal = useCustomerStore((s) => s.resetModal);
  const [sendingMenu, setSendingMenu] = useState(false);
  const { addToast } = useToastStore();
  const session = useAuthStore((s) => s.session);
  const canUpdate = hasActionPermission(session, 'customers', 'update');

  useEffect(() => {
    if (isOpen && customer) {
      fetchStats(customer.id, tenantId);
      fetchHistory({ customerId: customer.id, limit: HISTORY_PAGE_SIZE, offset: 0 }, tenantId);
      setPage(1);
    }
    return () => {
      if (!isOpen) resetModal();
    };
  }, [isOpen, customer, tenantId, fetchHistory, fetchStats, resetModal]);

  if (!customer) return null;

  const renderWhatsAppButton = (): React.ReactNode => {
    if (typeof customer.phone !== 'string' || !customer.phone) return null;
    const digits = customer.phone.replace(/[^0-9]/g, '');
    const waPhone = digits.startsWith('58') ? digits
      : digits.startsWith('0') ? `58${digits.slice(1)}`
      : `58${digits}`;
    return (
      <Tooltip content="Abrir chat en WhatsApp" variant="help">
      <a
        href={`https://wa.me/${waPhone}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1"
        aria-label="Abrir chat en WhatsApp con este cliente"
      >
      <Button variant="primary" className="w-full min-h-11 bg-[#25D366]! border-[#25D366]! hover:bg-[#1ebe57]!">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1.5 inline">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </Button>
    </a>
    </Tooltip>
    );
  };

  const handleSendMenu = async () => {
    setSendingMenu(true);
    try {
      const result = await generateMenuText(tenantId);
      if (!result.ok) {
        handleServiceError(result);
        return;
      }
      const menuText = result.data;
      const phone = normalizeWaPhone(customer.phone ?? '');
      if (phone && menuText) {
        const encoded = encodeURIComponent(menuText);
        const popup = window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
        if (!popup) {
          addToast({ type: 'warning', message: 'El navegador bloqueó la ventana emergente. Permite popups para este sitio.' });
        }
      }
    } catch (err) {
      logger.error('CustomerDetailModal', 'handleSendMenu error:', err);
      addToast({ type: 'error', message: 'Error al enviar el menú. Intenta nuevamente.' });
    } finally {
      setSendingMenu(false);
    }
  };

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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 w-full">
          {onEdit && (
            <Button variant="primary" className="flex-1 min-h-11" onClick={() => onEdit(customer)}>
              Editar
            </Button>
          )}
          {renderWhatsAppButton()}
          <Tooltip content="Enviar menú por WhatsApp" variant="help">
            <Button
              variant="outline"
              className="flex-1 min-h-11"
              onClick={handleSendMenu}
              loading={sendingMenu}
              aria-label="Enviar menú por WhatsApp"
            >
              <Send size={16} className="mr-1.5 inline" />
              <span className="hidden sm:inline">Enviar Menú</span>
              <span className="sm:hidden">Menú</span>
            </Button>
          </Tooltip>
          <Button variant="ghost" className="flex-1 min-h-11" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header card */}
        <div className="customer-header-card p-4 rounded-xl bg-linear-to-br from-primary/10 via-primary/5 to-accent/5 border border-primary/30">
          {/* Fila 1: Icono izquierda + Crédito derecha */}
          <div className="flex items-start justify-between mb-3">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-lg shadow-primary/20 ring-1 ring-primary/10 customer-avatar">
              <Users size={28} className="text-primary" />
            </div>
            {(customer.creditLimit ?? 0) > 0 && (
              <Badge variant="info" className="shrink-0 customer-badge">
                Crédito: {formatUsd(customer.creditLimit ?? 0)}
              </Badge>
            )}
          </div>
          {/* Fila 2: Nombre completo */}
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 wrap-break-word">{customer.name}</h3>
          {/* Fila 3: Badges */}
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="neutral" className="text-xs customer-badge">
              <Calendar className="h-3 w-3 mr-1 inline" />
              Miembro desde {new Date(customer.createdAt).toLocaleDateString('es-VE', { month: 'short', year: 'numeric' })}
            </Badge>
            {stats?.lastPurchaseAt && (
              <Badge variant="info" className="text-xs customer-badge">
                <ShoppingBag className="h-3 w-3 mr-1 inline" />
                Última compra: {formatTimeAgo(stats.lastPurchaseAt)}
              </Badge>
            )}
          </div>
        </div>

        {/* Datos del cliente */}
        <div className="flex flex-col gap-2 px-1">
          {customer.cedula && (
            <p className="text-sm sm:text-base text-text-secondary flex items-center gap-1.5 font-mono">
              <IdCard size={14} className="shrink-0" />
              <span className="wrap-break-word">{customer.cedula}</span>
            </p>
          )}
          {customer.phone && (
            <p className="text-sm sm:text-base text-text-secondary flex items-center gap-1.5">
              <Phone size={14} className="shrink-0" />
              <span className="wrap-break-word">{formatPhone(customer.phone)}</span>
            </p>
          )}
          {customer.address && (
            <p className="text-sm sm:text-base text-text-secondary flex items-center gap-1.5">
              <MapPin size={14} className="shrink-0" />
              <span className="wrap-break-word">{customer.address}</span>
            </p>
          )}
          {customer.notes && (
            <p className="text-sm sm:text-base text-text-secondary italic mt-1">{customer.notes}</p>
          )}
        </div>

        {/* Debt Section */}
        {customer.balance > 0 && canUpdate && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard size={20} className="text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Deuda pendiente</p>
                  <p className="text-xl font-bold text-amber-900">{formatUsd(customer.balance)}</p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowPaymentModal(true)}
                className="bg-amber-600 hover:bg-amber-700 min-h-11"
              >
                Cobrar deuda
              </Button>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Resumen de compras
          </h4>
          {stats ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="customer-kpi-card rounded-xl border border-primary/20 bg-linear-to-br from-primary/10 to-primary/20 p-3 sm:p-4 text-center shadow-sm shadow-primary/10">
                <DollarSign size={18} className="text-primary mx-auto mb-1" />
                <p className="text-sm text-text-secondary">Total gastado</p>
                <p className="text-lg sm:text-xl font-bold text-primary">{formatUsd(stats.totalSpentUsd)}</p>
                <p className="text-sm text-text-secondary">{formatBs(stats.totalSpentBs)}</p>
              </div>
              <div className="customer-kpi-card rounded-xl border border-info/20 bg-linear-to-br from-info/10 to-info/20 p-3 sm:p-4 text-center shadow-sm shadow-info/10">
                <ShoppingBag size={18} className="text-info mx-auto mb-1" />
                <p className="text-sm text-text-secondary">Compras</p>
                <p className="text-lg sm:text-xl font-bold text-info">{stats.purchaseCount}</p>
                <p className="text-sm text-text-secondary">transacciones</p>
              </div>
              <div className="customer-kpi-card rounded-xl border border-accent/20 bg-linear-to-br from-accent/10 to-accent/20 p-3 sm:p-4 text-center shadow-sm shadow-accent/10">
                <TrendingUp size={18} className="text-accent mx-auto mb-1" />
                <p className="text-sm text-text-secondary">Ticket promedio</p>
                <p className="text-lg sm:text-xl font-bold text-accent">{formatUsd(stats.averageTicketUsd)}</p>
                <p className="text-sm text-text-secondary">por compra</p>
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
            <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
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
              <div className="space-y-1.5 max-h-64 overflow-y-auto customer-stagger">
                {history.map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className="customer-item-hover flex items-center justify-between px-3 py-2.5 sm:py-3 rounded-lg border border-gray-100 bg-white hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-500">
                        {new Date(sale.createdAt).toLocaleString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-sm text-text-muted mt-0.5">
                        {sale.paymentMethod === 'efectivo_bs' ? 'Efectivo Bs' :
                          sale.paymentMethod === 'efectivo_usd' ? 'Efectivo USD' :
                          sale.paymentMethod === 'pago_movil' ? 'Pago Móvil' : 'Tarjeta'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-900">{formatBs(sale.totalBs)}</p>
                      <p className="text-sm text-text-secondary">
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

      <SaleDetailModal
        saleId={selectedSaleId}
        tenantId={tenantId}
        isOpen={!!selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />

      <PaymentModal
        customer={customer}
        tenantId={tenantId}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={() => {
          fetchStats(customer.id, tenantId);
          fetchHistory({ customerId: customer.id, limit: HISTORY_PAGE_SIZE, offset: 0 }, tenantId);
          onRefresh?.();
        }}
      />
    </Modal>
  );
});
