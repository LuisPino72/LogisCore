import { useState } from 'react';
import { Receipt, Edit2, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal } from '@/common/components';
import { formatUsd } from '@/lib/formatBs';
import type { Gasto } from '../types';

interface GastoListProps {
  gastos: Gasto[];
  loading: boolean;
  isOwner: boolean;
  onEdit: (gasto: Gasto) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: 'paid' | 'pending') => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  paid: { label: 'Pagado', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'warning' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function GastoList({ gastos, loading, isOwner, onEdit, onDelete, onToggleStatus }: GastoListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sorted = [...gastos].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading && gastos.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (gastos.length === 0) {
    return (
      <EmptyState
        icon={<Receipt size={32} />}
        title="Sin gastos"
        description="No hay gastos registrados para este período."
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
              <th className="py-3 px-3 font-semibold text-right">Monto USD</th>
              <th className="py-3 px-3 font-semibold">Fecha</th>
              <th className="py-3 px-3 font-semibold">Estado</th>
              <th className="py-3 px-3 font-semibold text-center">Recurrente</th>
              <th className="py-3 px-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((gasto) => (
              <tr key={gasto.id} className="border-b border-border/50 hover:bg-surface-alt/50 transition-colors">
                <td className="py-3 px-3 font-medium text-gray-800">{gasto.category}</td>
                <td className="py-3 px-3 text-right font-semibold text-primary">{formatUsd(gasto.amountUsd)}</td>
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
                <td className="py-3 px-3">
                  <div className="flex items-center justify-end gap-1">
                    {gasto.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => onToggleStatus(gasto.id, gasto.status === 'paid' ? 'pending' : 'paid')}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-accent/5 transition-colors"
                        title={gasto.status === 'paid' ? 'Marcar pendiente' : 'Marcar pagado'}
                      >
                        <AlertCircle size="16" />
                      </button>
                    )}
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(gasto)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size="16" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(gasto.id)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/5 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size="16" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {sorted.map((gasto) => (
          <Card key={gasto.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge status={gasto.status} />
                  {gasto.isRecurring && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-accent font-medium">
                      <RotateCcw size="12" />
                      {gasto.recurrenceType === 'yearly' ? 'Anual' : 'Mensual'}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800">{gasto.category}</p>
                <p className="text-xs text-text-secondary mt-0.5">{formatDate(gasto.date)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-primary">{formatUsd(gasto.amountUsd)}</p>
              </div>
            </div>
            {gasto.description && (
              <p className="text-xs text-text-secondary mt-2 line-clamp-2">{gasto.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
              {gasto.status !== 'cancelled' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleStatus(gasto.id, gasto.status === 'paid' ? 'pending' : 'paid')}
                  className="text-accent text-xs"
                >
                  <AlertCircle size="14" />
                  {gasto.status === 'paid' ? 'Pendiente' : 'Pagado'}
                </Button>
              )}
              {isOwner && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(gasto)}>
                    <Edit2 size="14" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(gasto.id)} className="text-danger">
                    <Trash2 size="14" />
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {deleteId && (
        <Modal isOpen={true} onClose={() => setDeleteId(null)} title="Eliminar gasto">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿Eliminar este gasto?</p>
                <p className="text-xs text-gray-500">El gasto se ocultará de la lista.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setDeleteId(null)}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={() => { onDelete(deleteId); setDeleteId(null); }}>
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
