import { useEffect, useState } from 'react';
import { Modal, EmptyState, Spinner, Pagination } from '../../../common/components';
import { History } from 'lucide-react';
import { purchaseService } from '../services/purchaseService';
import { formatUsd } from '@/lib/formatBs';

const PAGE_SIZE = 20;

interface PriceHistoryModalProps {
  supplierId: string;
  productId: string;
  productName: string;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PriceEntry {
  date: string;
  quantity: number;
  costPerUnit: number;
  totalUsd: number;
  orderId: string;
}

export function PriceHistoryModal({ supplierId, productId, productName, tenantId, isOpen, onClose }: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen || !supplierId || !productId) return;
    setLoading(true);
    setPage(1);
    purchaseService.getPriceHistory(supplierId, productId, tenantId).then((result) => {
      if (result.ok) setHistory(result.data);
      setLoading(false);
    });
  }, [isOpen, supplierId, productId, tenantId]);

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pageData = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" title="Historial de precios">
      <div className="space-y-3">
        <p className="text-xs text-text-secondary truncate">
          <span className="font-medium text-gray-700">{productName}</span>
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={<History size={32} />}
            title="Sin historial"
            description="Este producto no tiene órdenes de compra previas con este proveedor."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-text-secondary">Fecha</th>
                    <th className="text-right py-2 px-2 font-medium text-text-secondary">Cant.</th>
                    <th className="text-right py-2 px-2 font-medium text-text-secondary">Costo/Unit</th>
                    <th className="text-right py-2 px-2 font-medium text-text-secondary">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((entry, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-2 px-2 text-gray-700">
                        {new Date(entry.date).toLocaleDateString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-700">{entry.quantity}</td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900">{formatUsd(entry.costPerUnit)}</td>
                      <td className="py-2 px-2 text-right text-gray-600">{formatUsd(entry.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {pageData.map((entry, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {new Date(entry.date).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      })}
                    </span>
                    <span className="text-xs font-bold text-gray-900">{formatUsd(entry.totalUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Cant: {entry.quantity}</span>
                    <span className="text-text-secondary">Unit: {formatUsd(entry.costPerUnit)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-text-secondary pt-1 border-t border-gray-100">
              <span>{history.length} compra{history.length !== 1 ? 's' : ''}</span>
              <span>
                Promedio:{' '}
                {formatUsd(history.reduce((sum, e) => sum + e.costPerUnit, 0) / history.length)}
              </span>
            </div>

            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
