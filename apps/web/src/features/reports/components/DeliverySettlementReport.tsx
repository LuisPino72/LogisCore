import { useState, useCallback } from 'react';
import { Card, Button, Spinner, EmptyState, Modal, DatePicker } from '@/common/components';
import { Truck, Check, Wallet, AlertCircle } from 'lucide-react';
import { useDeliverySettlement } from '../hooks/useDeliverySettlement';
import { getDb } from '../../../services/dexie/db';
import { formatUsd } from '@/lib/formatBs';

interface DeliverySettlementReportProps {
  tenantId: string;
}

export function DeliverySettlementReport({ tenantId }: DeliverySettlementReportProps) {
  const { data, loading, date, setDate, refresh } = useDeliverySettlement(tenantId);
  const [paying, setPaying] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ name: string; amount: number } | null>(null);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    const clamped = v > today ? today : v;
    setDate({ start: `${clamped}T00:00:00`, end: `${clamped}T23:59:59` });
  }, [setDate]);

  const handlePay = useCallback(async () => {
    if (!confirmModal) return;
    setPaying(confirmModal.name);
    try {
      const db = getDb();
      const sales = await db.sales
        .where('tenantId')
        .equals(tenantId)
        .filter((s) =>
          s.status === 'entregada' &&
          s.createdAt >= date.start &&
          s.createdAt <= date.end &&
          !s.deletedAt &&
          s.deliveryPersonName === confirmModal.name
        )
        .toArray();
      const saleIds = new Set(sales.map((s) => s.id));
      const expenses = await db.expenses
        .where('tenantId')
        .equals(tenantId)
        .filter((e) =>
          e.category === 'DELIVERY' &&
          !e.deletedAt &&
          !!e.saleId && saleIds.has(e.saleId) &&
          e.status === 'pending'
        )
        .toArray();
      await Promise.all(
        expenses.map((e) => db.expenses.update(e.id, { status: 'paid' as const, updatedAt: new Date().toISOString() }))
      );
      setConfirmModal(null);
      refresh();
    } catch (err) {
      console.error('Error pagando:', err);
    } finally {
      setPaying(null);
    }
  }, [confirmModal, tenantId, date, refresh]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <div className="skeleton h-5 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="skeleton h-5 w-24 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="space-y-1">
                    <div className="skeleton h-3 w-12 rounded" />
                    <div className="skeleton h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center gap-3 mb-4">
          <DatePicker
            label="Fecha"
            value={date.start.slice(0, 10)}
            onChange={handleDateChange}
          />
        </div>
        <EmptyState
          icon={<Truck size={32} />}
          title="Sin entregas"
          description="No hay entregas registradas para esta fecha."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <DatePicker
          label="Fecha"
          value={date.start.slice(0, 10)}
          onChange={handleDateChange}
        />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-semibold text-gray-700">Motorizado</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Entregas</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Tarifas</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Pagado</th>
              <th className="text-right py-2 px-2 font-semibold text-gray-700">Pendiente</th>
              <th className="text-center py-2 px-2 font-semibold text-gray-700">Acción</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="py-2 px-2 font-medium text-gray-900">
                  <div className="flex items-center gap-1.5">
                    <Truck size={14} className="text-primary shrink-0" />
                    {row.name}
                  </div>
                </td>
                <td className="py-2 px-2 text-right text-gray-900 font-medium">{row.deliveryCount}</td>
                <td className="py-2 px-2 text-right text-gray-900">{formatUsd(row.totalFees)}</td>
                <td className="py-2 px-2 text-right text-success">{formatUsd(row.paidAmount)}</td>
                <td className="py-2 px-2 text-right">
                  {row.pendingAmount > 0 ? (
                    <span className="text-danger font-semibold">{formatUsd(row.pendingAmount)}</span>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  {row.pendingAmount > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmModal({ name: row.name, amount: row.pendingAmount })}
                      disabled={paying === row.name}
                    >
                      {paying === row.name ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <Check size={14} />
                          Pagar
                        </>
                      )}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {data.map((row, index) => (
          <Card
            key={row.name}
            className="overflow-hidden transition-all duration-200 hover:shadow-md animate-report-stagger"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-primary" />
                  <h4 className="text-sm font-bold text-gray-900">{row.name}</h4>
                </div>
                <span className="text-xs text-gray-700">{row.deliveryCount} entregas</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-primary/5">
                  <p className="text-gray-700">Tarifas</p>
                  <p className="font-semibold text-primary">{formatUsd(row.totalFees)}</p>
                </div>
                <div className="p-2 rounded-lg bg-success/5">
                  <p className="text-gray-700">Pagado</p>
                  <p className="font-semibold text-success">{formatUsd(row.paidAmount)}</p>
                </div>
              </div>
              {row.pendingAmount > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-danger" />
                    <span className="text-xs font-semibold text-danger">Pendiente: {formatUsd(row.pendingAmount)}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setConfirmModal({ name: row.name, amount: row.pendingAmount })}
                    disabled={paying === row.name}
                  >
                    {paying === row.name ? <Spinner size="sm" /> : <><Check size={14} /> Pagar</>}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Confirmar Pago"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmModal(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={handlePay}
              disabled={!!paying}
            >
              <Wallet size={14} />
              Confirmar Pago
            </Button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 space-y-2">
          <p>¿Confirmar pago a <strong>{confirmModal?.name}</strong>?</p>
          <div className="p-3 rounded-lg bg-success/5 border border-success/20">
            <p className="text-xs text-gray-700">Monto a pagar</p>
            <p className="text-lg font-bold text-success">{confirmModal ? formatUsd(confirmModal.amount) : ''}</p>
          </div>
          <p className="text-xs text-gray-700">Se marcarán los gastos pendientes como pagados.</p>
        </div>
      </Modal>
    </div>
  );
}
