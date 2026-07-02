import { useEffect, useState } from 'react';
import { Modal, Spinner, EmptyState, Button } from '../../../common/components';
import { formatBs } from '@/lib/formatBs';
import { posService } from '../services/posService';
import type { ClosingBreakdown, ClosingBreakdownItem } from '../services/cashRegisterService';

interface ClosingBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  tenantId: string;
}

export function ClosingBreakdownModal({ isOpen, onClose, sessionId, tenantId }: ClosingBreakdownModalProps) {
  const [breakdown, setBreakdown] = useState<ClosingBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sessionId || !tenantId) return;
    setLoading(true);
    setError(null);
    posService.getClosingBreakdown(sessionId, tenantId).then((result) => {
      if (result.ok) {
        setBreakdown(result.data);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    });
  }, [isOpen, sessionId, tenantId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del Cierre Esperado">
      <div className="flex flex-col gap-3 animate-slide-down">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="sm" /></div>
        ) : error ? (
          <EmptyState icon={null} title="Error" description={error} />
        ) : breakdown ? (
          <>
            <div className="bg-surface-alt rounded-lg text-sm divide-y divide-border">
              {breakdown.items.length === 0 && breakdown.openingBalanceBs === 0 ? (
                <div className="p-3 text-center text-text-muted">No hay movimientos registrados</div>
              ) : (
                breakdown.items.map((item) => (
                  <BreakdownRow key={item.id} item={item} />
                ))
              )}
              <div className="flex justify-between items-center p-3 bg-primary/5 font-bold text-sm">
                <span>Cierre esperado</span>
                <span>{formatBs(breakdown.expectedClosing)}</span>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function BreakdownRow({ item }: { item: ClosingBreakdownItem }) {
  const colorMap: Record<string, string> = {
    opening: 'text-blue-600',
    sale: 'text-green-600',
    debt: 'text-amber-600',
  };
  const labelMap: Record<string, string> = {
    opening: 'Apertura',
    sale: 'Venta',
    debt: 'Deuda',
  };
  return (
    <div className="flex justify-between items-center p-3 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${colorMap[item.type]} bg-current/10`}>
          {labelMap[item.type]}
        </span>
        <span className="truncate text-text">{item.description}</span>
      </div>
      <span className="font-medium shrink-0 ml-2">{formatBs(item.amountBs)}</span>
    </div>
  );
}
