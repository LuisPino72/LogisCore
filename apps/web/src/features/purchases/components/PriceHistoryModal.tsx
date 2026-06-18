import { useEffect, useState } from 'react';
import { Modal, EmptyState, Spinner, Pagination, Button } from '../../../common/components';
import { History, TrendingUp, TrendingDown } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen || !supplierId || !productId) return;
    setLoading(true);
    setError(null);
    setHistory([]);
    setPage(1);
    purchaseService.getPriceHistory(supplierId, productId, tenantId)
      .then((result) => {
        if (result.ok) {
          setHistory(result.data);
        } else {
          setError(result.error?.message || 'Error al cargar historial de precios');
        }
      })
      .catch(() => {
        setError('Error inesperado al cargar historial');
      })
      .finally(() => {
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
        ) : error ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => {
              setLoading(true);
              setError(null);
              purchaseService.getPriceHistory(supplierId, productId, tenantId)
                .then((result) => {
                  if (result.ok) setHistory(result.data);
                  else setError(result.error?.message || 'Error al cargar historial');
                })
                .catch(() => setError('Error inesperado'))
                .finally(() => setLoading(false));
            }}>
              Reintentar
            </Button>
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
                <tbody className="purchase-stagger">
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
                      <td className="py-2 px-2 text-right font-medium text-gray-900">
                        <span className="inline-flex items-center gap-1">
                          {formatUsd(entry.costPerUnit)}
                          {i > 0 && pageData[i - 1] && (
                            entry.costPerUnit > pageData[i - 1].costPerUnit
                              ? <TrendingUp size={12} className="text-danger" />
                              : entry.costPerUnit < pageData[i - 1].costPerUnit
                                ? <TrendingDown size={12} className="text-success" />
                                : null
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">{formatUsd(entry.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2 supplier-stagger">
              {pageData.map((entry, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-white p-3 space-y-1.5 hover:border-primary/20 transition-colors">
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
                    <span className="text-text-secondary inline-flex items-center gap-1">Unit: {formatUsd(entry.costPerUnit)}
                      {i > 0 && pageData[i - 1] && (
                        entry.costPerUnit > pageData[i - 1].costPerUnit
                          ? <TrendingUp size={12} className="text-danger" />
                          : entry.costPerUnit < pageData[i - 1].costPerUnit
                            ? <TrendingDown size={12} className="text-success" />
                            : null
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-text-secondary pt-2 border-t border-gray-100">
              <span className="px-2.5 py-1 rounded-full bg-gray-100 font-medium">{history.length} compra{history.length !== 1 ? 's' : ''}</span>
              <span className="px-2.5 py-1 rounded-full bg-primary/5 text-primary font-semibold">
                Promedio:{' '}
                {formatUsd(history.reduce((sum, e) => sum + e.totalUsd, 0) / history.reduce((sum, e) => sum + e.quantity, 0))}
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
