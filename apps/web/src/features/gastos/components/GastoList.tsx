import { useState } from 'react';
import { Receipt, Trash2, RotateCcw, CheckCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal } from '@/common/components';
import { formatUsd } from '@/lib/formatBs';
import type { Gasto } from '../types';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function GastoList({ gastos, loading, isOwner, onDelete, onToggleStatus }: GastoListProps) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; category: string } | null>(null);
  const [confirmPayTarget, setConfirmPayTarget] = useState<{ id: string; category: string; amountUsd: number } | null>(null);

  const sorted = [...gastos].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
        icon={<Receipt size={32} />}
        title="Todavía no hay gastos"
        description="Lleva el control de tus gastos fijos y variables del negocio."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-secondary uppercase tracking-wider">
              <th className="py-3 px-3 font-semibold">Categoría</th>
              <th className="py-3 px-3 font-semibold text-right">Monto $</th>
              <th className="py-3 px-3 font-semibold">Fecha</th>
              <th className="py-3 px-3 font-semibold">Estado</th>
              <th className="py-3 px-3 font-semibold text-center">Recurrente</th>
              <th className="py-3 px-3 font-semibold">Descripción</th>
              <th className="py-3 px-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((gasto, idx) => (
              <tr
                key={gasto.id}
                className={`border-b border-border/50 transition-colors hover:bg-primary/2 ${
                  idx % 2 === 0 ? 'bg-white' : 'bg-surface-alt/30'
                }`}
              >
                <td className="py-3 px-3 font-medium text-gray-800">{gasto.category}</td>
                <td className="py-3 px-3 text-right font-bold text-primary text-base">{formatUsd(gasto.amountUsd)}</td>
                <td className="py-3 px-3 text-text-secondary whitespace-nowrap">{formatDate(gasto.date)}</td>
                <td className="py-3 px-3">
                  <StatusBadge status={gasto.status} />
                </td>
                <td className="py-3 px-3 text-center">
                  {gasto.isRecurring ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent font-medium">
                      <RotateCcw size={14} />
                      {gasto.recurrenceType === 'yearly' ? 'Anual' : 'Mensual'}
                    </span>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </td>
                <td className="py-3 px-3 max-w-[200px]">
                  <span className="text-xs text-text-secondary truncate block">{gasto.description || '—'}</span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center justify-end gap-1">
                    {gasto.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => setConfirmPayTarget({ id: gasto.id, category: gasto.category, amountUsd: gasto.amountUsd })}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-success hover:bg-success/5 transition-colors active:scale-90"
                        title="Marcar pagado"
                      >
                        <CheckCircle size="16" />
                      </button>
                    )}
                    {isOwner && gasto.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: gasto.id, category: gasto.category })}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/5 transition-colors active:scale-90"
                        title="Eliminar"
                      >
                        <Trash2 size="16" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden grid grid-cols-1 gap-3">
        {sorted.map((gasto) => (
          <MobileCard
            key={gasto.id}
            gasto={gasto}
            isOwner={isOwner}
            onDelete={setDeleteTarget}
            onPay={setConfirmPayTarget}
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
              <p className="text-sm font-semibold">¿Eliminar gasto de {deleteTarget.category}?</p>
              <p className="text-xs text-gray-500 mt-1">El gasto se ocultará de la lista.</p>
            </div>
            <div className="flex gap-3 w-full pt-1">
              <Button variant="ghost" fullWidth onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}>
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
                Gasto de <span className="font-medium text-gray-700">{confirmPayTarget.category}</span> por{' '}
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
}: {
  gasto: Gasto;
  isOwner: boolean;
  onDelete: (t: { id: string; category: string }) => void;
  onPay: (t: { id: string; category: string; amountUsd: number }) => void;
}) {
  const status = STATUS_CONFIG[gasto.status] ?? STATUS_CONFIG.pending;
  const isPending = gasto.status === 'pending';

  return (
    <Card className="overflow-hidden">
      {/* Monto destacado */}
      <div className="text-center pt-5 pb-3 px-4">
        <p className="text-2xl font-bold text-primary leading-none tracking-tight">
          {formatUsd(gasto.amountUsd)}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex justify-center pb-3 px-4">
        <span
          className={`
            inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
            ${gasto.status === 'paid' ? 'bg-success/10 text-success' : ''}
            ${gasto.status === 'pending' ? 'bg-warning/10 text-warning' : ''}
            ${gasto.status === 'cancelled' ? 'bg-danger/10 text-danger' : ''}
          `}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
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
        <p className="text-sm font-semibold text-gray-800 leading-snug">{gasto.category}</p>
        {gasto.description && (
          <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">{gasto.description}</p>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex items-stretch border-t border-border">
        {isPending && (
          <button
            type="button"
            onClick={() => onPay({ id: gasto.id, category: gasto.category, amountUsd: gasto.amountUsd })}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-success bg-success/6 hover:bg-success/10 active:scale-[0.98] transition-all duration-150 relative overflow-hidden group"
          >
            <span className="absolute inset-0 bg-linear-to-r from-success/0 via-success/10 to-success/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <CheckCircle size={15} className="relative z-10" />
            <span className="relative z-10">Pagar</span>
          </button>
        )}
        {isOwner && gasto.status !== 'paid' && (
          <button
            type="button"
            onClick={() => onDelete({ id: gasto.id, category: gasto.category })}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-text-secondary hover:text-danger hover:bg-danger/4 active:scale-[0.98] transition-all duration-150 border-l border-border"
          >
            <Trash2 size={14} />
            <span className="hidden min-[360px]:inline">Eliminar</span>
          </button>
        )}
        {gasto.status === 'paid' && (
          <div className="flex-1 flex items-center justify-center py-3 text-xs text-text-muted">
            <span>Sin acciones</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as const, dot: 'bg-gray-400' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
