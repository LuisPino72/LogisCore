import { useState, useMemo } from 'react';
import { Receipt, Trash2, RotateCcw, CheckCircle } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Modal, DataTable, type Column } from '@/common/components';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/formatBs';
import { formatDate } from '../../../lib/formatDate';
import { useGastosStore } from '../stores/gastosStore';
import type { Gasto } from '../types';
import { getExpenseCategoryLabel } from '../types';

interface GastoListProps {
  gastos: Gasto[];
  loading: boolean;
  isOwner: boolean;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: 'paid' | 'pending') => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger'; dot: string }> = {
  paid: { label: 'Pagado', variant: 'success', dot: 'bg-success' },
  pending: { label: 'Pendiente', variant: 'warning', dot: 'bg-warning' },
  cancelled: { label: 'Cancelado', variant: 'danger', dot: 'bg-danger' },
};

export function GastoList({ gastos, loading, isOwner, onDelete, onToggleStatus }: GastoListProps) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; category: string } | null>(null);
  const [confirmPayTarget, setConfirmPayTarget] = useState<{ id: string; category: string; amountUsd: number } | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const { selectedIds, toggleSelect } = useGastosStore();

  const handleDeleteWithAnimation = (id: string) => {
    setExitingId(id);
    setTimeout(() => {
      onDelete(id);
      setExitingId(null);
    }, 200);
  };

  const sorted = useMemo(
    () => [...gastos].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [gastos]
  );

  const columns: Column<Gasto>[] = useMemo(() => [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (g) => g.status === 'pending' ? (
        <Checkbox
          checked={selectedIds.includes(g.id)}
          onChange={() => toggleSelect(g.id)}
        />
      ) : null,
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (g) => (
        <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
          {getExpenseCategoryLabel(g.category)}
          {g.category === 'COMPRA_INVENTARIO' && <Badge variant="neutral">Sistema</Badge>}
        </span>
      ),
    },
    {
      key: 'amountUsd',
      header: 'Monto $',
      align: 'right',
      render: (g) => <span className="font-bold text-primary text-base">{formatUsd(g.amountUsd)}</span>,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (g) => <span className="text-text-secondary whitespace-nowrap">{formatDate(g.date)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (g) => <StatusBadge status={g.status} />,
    },
    {
      key: 'recurring',
      header: 'Recurrente',
      align: 'center',
      render: (g) => g.isRecurring ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
          <RotateCcw size={10} />
          {g.recurrenceType === 'yearly' ? 'Anual' : 'Mensual'}
        </span>
      ) : <span className="text-xs text-text-secondary">—</span>,
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (g) => <span className="text-xs text-text-secondary truncate block max-w-[200px]">{g.description || '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '100px',
      render: (g) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost-success"
            size="sm"
            disabled={g.status !== 'pending'}
            onClick={() => setConfirmPayTarget({ id: g.id, category: g.category, amountUsd: g.amountUsd })}
            aria-label="Marcar pagado"
          >
            <CheckCircle size="16" />
          </Button>
          <Button
            variant="ghost-danger"
            size="sm"
            disabled={!isOwner || g.status === 'paid'}
            onClick={() => setDeleteTarget({ id: g.id, category: g.category })}
            aria-label="Eliminar"
          >
            <Trash2 size="16" />
          </Button>
        </div>
      ),
    },
  ], [selectedIds, toggleSelect, isOwner]);

  if (loading && gastos.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (gastos.length === 0) {
    return (
      <EmptyState
        icon={<Receipt size={32} className="expense-empty-icon" />}
        title="Todavía no hay gastos"
        description="Lleva el control de tus gastos fijos y variables del negocio."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={sorted}
          keyExtractor={(g) => g.id}
          rowClassName={() => 'expense-table-row'}
        />
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3 expense-stagger">
        {sorted.map((gasto) => (
          <MobileCard
            key={gasto.id}
            gasto={gasto}
            isOwner={isOwner}
            onDelete={setDeleteTarget}
            onPay={setConfirmPayTarget}
            isSelected={selectedIds.includes(gasto.id)}
            onToggleSelect={toggleSelect}
            exitingId={exitingId}
          />
        ))}
      </div>

      {deleteTarget && (
        <Modal isOpen={true} onClose={() => setDeleteTarget(null)} title="Eliminar gasto">
          <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
              <Trash2 size={24} className="text-danger" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">¿Eliminar gasto de {getExpenseCategoryLabel(deleteTarget.category)}?</p>
              <p className="text-xs text-gray-500 mt-1">El gasto se ocultará de la lista.</p>
            </div>
            <div className="flex gap-3 w-full pt-1">
              <Button variant="ghost" fullWidth onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={() => { handleDeleteWithAnimation(deleteTarget.id); setDeleteTarget(null); }}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmPayTarget && (
        <Modal isOpen={true} onClose={() => setConfirmPayTarget(null)} title="Confirmar pago">
          <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-success/20 bg-success/10">
              <CheckCircle size={24} className="text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">¿Marcar como pagado?</p>
              <p className="text-xs text-gray-500 mt-1">
                Gasto de <span className="font-medium text-gray-700">{getExpenseCategoryLabel(confirmPayTarget.category)}</span> por{' '}
                <span className="font-medium text-gray-700">{formatUsd(confirmPayTarget.amountUsd)}</span>
              </p>
            </div>
            <div className="flex gap-3 w-full pt-1">
              <Button variant="ghost" fullWidth onClick={() => setConfirmPayTarget(null)}>
                Cancelar
              </Button>
              <Button variant="primary" fullWidth onClick={() => { onToggleStatus(confirmPayTarget.id, 'paid'); setConfirmPayTarget(null); }}>
                Marcar pagado
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function MobileCard({
  gasto,
  isOwner,
  onDelete,
  onPay,
  isSelected,
  onToggleSelect,
  exitingId,
}: {
  gasto: Gasto;
  isOwner: boolean;
  onDelete: (t: { id: string; category: string }) => void;
  onPay: (t: { id: string; category: string; amountUsd: number }) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  exitingId: string | null;
}) {
  const status = STATUS_CONFIG[gasto.status] ?? STATUS_CONFIG.pending;
  const isPending = gasto.status === 'pending';

  return (
    <Card className={cn("overflow-hidden expense-card-hover ripple-effect", exitingId === gasto.id && "animate-cart-remove")}>
      {/* Monto destacado */}
      <div className="text-center pt-5 pb-3 px-4 relative">
        {isPending && (
          <label className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center cursor-pointer">
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelect(gasto.id)}
            />
          </label>
        )}
        <p className="text-2xl font-bold text-primary leading-none tracking-tight">
          {formatUsd(gasto.amountUsd)}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex justify-center pb-3 px-4">
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Fecha + recurrente */}
      <div className="flex items-center justify-center gap-2 text-xs text-text-secondary pb-2 px-4">
        <span>{formatDate(gasto.date)}</span>
        {gasto.isRecurring && (
          <>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1 text-accent font-medium">
              <RotateCcw size={11} />
              {gasto.recurrenceType === 'yearly' ? 'Anual' : 'Mensual'}
            </span>
          </>
        )}
      </div>

      {/* Categoría + descripción */}
      <div className="text-center px-4 pb-4">
        <p className="text-sm font-semibold text-gray-800 leading-snug inline-flex items-center gap-1.5">
          {getExpenseCategoryLabel(gasto.category)}
          {gasto.category === 'COMPRA_INVENTARIO' && <Badge variant="neutral">Sistema</Badge>}
        </p>
        {gasto.description && (
          <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">{gasto.description}</p>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex items-stretch border-t border-border">
        <Button
          variant="ghost-success"
          disabled={!isPending}
          className="flex-1 rounded-none relative overflow-hidden group"
          onClick={() => onPay({ id: gasto.id, category: gasto.category, amountUsd: gasto.amountUsd })}
        >
          <span className="absolute inset-0 bg-linear-to-r from-success/0 via-success/10 to-success/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <CheckCircle size={15} className="relative z-10" />
          <span className="relative z-10">Pagar</span>
        </Button>
        <Button
          variant="ghost-danger"
          disabled={!isOwner || gasto.status === 'paid'}
          className="flex-1 rounded-none border-l border-border"
          onClick={() => onDelete({ id: gasto.id, category: gasto.category })}
        >
          <Trash2 size={14} />
          <span className="hidden min-[360px]:inline">Eliminar</span>
        </Button>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as const, dot: 'bg-gray-400' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
