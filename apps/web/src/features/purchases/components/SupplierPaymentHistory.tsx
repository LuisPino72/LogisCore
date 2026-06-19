import { useState, useEffect } from 'react';
import { Calendar, DollarSign } from 'lucide-react';
import { Badge, EmptyState, Pagination } from '../../../common/components';
import { formatUsd } from '@/lib/formatBs';
import { formatDate } from '../../../lib/formatDate';
import { getDb } from '../../../services/dexie/db';

interface SupplierPaymentHistoryProps {
  supplierId: string;
  tenantId: string;
}

const PAGE_SIZE = 10;

export function SupplierPaymentHistory({ supplierId, tenantId }: SupplierPaymentHistoryProps) {
  const [payments, setPayments] = useState<Array<{
    id: string; amountUsd: number; amountBs: number; paymentMethod: string;
    reference?: string; createdAt: string; purchaseOrderId: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const db = getDb();
        const rows = await db.supplierPayments
          .where({ tenantId })
          .filter((p: any) => p.supplierId === supplierId && !p.deletedAt)
          .toArray();
        const sorted = rows
          .map((r: any) => ({
            id: r.id, amountUsd: r.amountUsd, amountBs: r.amountBs,
            paymentMethod: r.paymentMethod, reference: r.reference,
            createdAt: r.createdAt, purchaseOrderId: r.purchaseOrderId,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setPayments(sorted);
      } catch {
        setPayments([]);
      }
      setLoading(false);
    };
    load();
  }, [supplierId, tenantId]);

  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>;

  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<DollarSign size={24} />}
        title="Sin pagos registrados"
        description="Aún no se han registrado pagos a este proveedor."
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const paged = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const METHOD_LABELS: Record<string, string> = {
    efectivo_bs: 'Efectivo Bs',
    efectivo_usd: 'Efectivo USD',
    pago_movil: 'Pago Móvil',
    transferencia: 'Transferencia',
    tarjeta_bs: 'Tarjeta Bs',
    tarjeta_usd: 'Tarjeta USD',
    deposito: 'Depósito',
    cheque: 'Cheque',
    otro: 'Otro',
  };

  return (
    <div className="space-y-2">
      {paged.map((p) => (
        <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-white">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{formatUsd(p.amountUsd)}</span>
              <Badge variant="neutral">{METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-secondary flex items-center gap-1">
                <Calendar size={10} />
                {formatDate(p.createdAt)}
              </span>
              {p.reference && <span className="text-xs text-text-secondary">Ref: {p.reference}</span>}
            </div>
          </div>
          <span className="text-xs text-text-secondary shrink-0 ml-2">Bs {p.amountBs.toFixed(2)}</span>
        </div>
      ))}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
