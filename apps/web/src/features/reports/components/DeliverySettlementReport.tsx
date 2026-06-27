import { useState, useCallback, useMemo, memo } from 'react';
import { Card, Button, Spinner, EmptyState, Modal, DatePicker, Skeleton, Alert, DataTable } from '@/common/components';
import type { Column } from '@/common/components';
import { Truck, Check, Wallet, AlertCircle } from 'lucide-react';
import { useDeliverySettlement } from '../hooks/useDeliverySettlement';
import { formatUsd } from '@/lib/formatBs';
import type { DeliverySettlementRow } from '../services/deliverySettlementService';

interface DeliverySettlementReportProps {
  tenantId: string;
}

export const DeliverySettlementReport = memo(function DeliverySettlementReport({ tenantId }: DeliverySettlementReportProps) {
  const { data, loading, error, date, setDate, paySettlement } = useDeliverySettlement(tenantId);
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
    const result = await paySettlement(confirmModal.name, date.start, date.end);
    if (result.ok) {
      setConfirmModal(null);
    }
    setPaying(null);
  }, [confirmModal, paySettlement, date]);

  const columns: Column<DeliverySettlementRow>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Motorizado',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Truck size={14} className="text-primary shrink-0" />
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'deliveryCount',
      header: 'Entregas',
      align: 'right',
      render: (row) => <span className="font-medium">{row.deliveryCount}</span>,
    },
    {
      key: 'totalFees',
      header: 'Tarifas',
      align: 'right',
      render: (row) => formatUsd(row.totalFees),
    },
    {
      key: 'paidAmount',
      header: 'Pagado',
      align: 'right',
      render: (row) => <span className="text-success">{formatUsd(row.paidAmount)}</span>,
    },
    {
      key: 'pendingAmount',
      header: 'Pendiente',
      align: 'right',
      render: (row) => row.pendingAmount > 0
        ? <span className="text-danger font-semibold">{formatUsd(row.pendingAmount)}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'action',
      header: 'Acción',
      align: 'center',
      hideOnMobile: true,
      render: (row) => row.pendingAmount > 0 && (
        <Button
          variant="primary"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setConfirmModal({ name: row.name, amount: row.pendingAmount }); }}
          disabled={paying === row.name}
          aria-label={`Pagar pendiente de ${row.name}`}
        >
          {paying === row.name ? <Spinner size="sm" /> : <><Check size={14} /> Pagar</>}
        </Button>
      ),
    },
  ], [paying]);

  const renderCard = useCallback((row: DeliverySettlementRow) => (
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
            aria-label={`Pagar pendiente de ${row.name}`}
          >
            {paying === row.name ? <Spinner size="sm" /> : <><Check size={14} /> Pagar</>}
          </Button>
        </div>
      )}
    </div>
  ), [paying]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <Skeleton className="h-5 w-24 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="space-y-1">
                    <Skeleton className="h-3 w-12 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <DatePicker
          label="Fecha"
          value={date.start.slice(0, 10)}
          onChange={handleDateChange}
        />
        <Alert variant="error" title="Error al cargar liquidaciones">{error}</Alert>
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

      <DataTable<DeliverySettlementRow>
        columns={columns}
        data={data}
        keyExtractor={(row) => row.name}
        renderCardOnMobile
        renderCard={renderCard}
      />

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
});
