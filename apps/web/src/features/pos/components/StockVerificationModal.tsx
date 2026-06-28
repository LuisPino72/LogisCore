import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Spinner } from '../../../common/components';
import { posService } from '../services/posService';
import { inventoryService } from '../../inventory/services/inventoryService';
import { displayQty } from '../../inventory/types';
import { useToastStore } from '../../../stores/toastStore';

interface VerificationItem {
  productId: string;
  productName: string;
  productSku: string;
  isWeighted: boolean;
  unit: string;
  logicalStock: number;
  physicalInput: string;
  soldToday: number;
  isLowStock: boolean;
  isZeroStock: boolean;
}

interface StockVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  tenantId: string;
  userId: string;
  referenceDate?: Date;
}

export function StockVerificationModal({
  isOpen,
  onClose,
  onComplete,
  tenantId,
  userId,
  referenceDate,
}: StockVerificationModalProps) {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExcessiveConfirm, setShowExcessiveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastStore();

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await posService.getVerificationProducts(tenantId, referenceDate);
      if (result.ok) {
        const verified = result.data.map((item) => ({
          ...item,
          physicalInput: displayQty(item.logicalStock, item.unit),
        }));
        setItems(verified);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Error al cargar productos para verificación. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, referenceDate]);

  useEffect(() => {
    if (isOpen) loadProducts();
  }, [isOpen, loadProducts]);

  const handlePhysicalChange = useCallback((productId: string, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, physicalInput: value } : item,
      ),
    );
  }, []);

  const getLogicalDisplay = (item: VerificationItem): number => {
    return parseFloat(displayQty(item.logicalStock, item.unit));
  };

  const getDifference = (item: VerificationItem): number => {
    const physical = parseFloat(item.physicalInput);
    if (isNaN(physical)) return 0;
    const logical = getLogicalDisplay(item);
    return parseFloat((physical - logical).toFixed(2));
  };

  const getExcessiveItems = (): VerificationItem[] => {
    return items.filter((item) => {
      const logical = getLogicalDisplay(item);
      const physical = parseFloat(item.physicalInput);
      if (isNaN(physical)) return false;
      return (logical > 0 && physical > logical * 2) || (logical === 0 && physical > 10);
    });
  };

  const pendingChanges = items.filter((item) => {
    const diff = getDifference(item);
    return diff !== 0;
  }).length;

  const handleAdjustAll = useCallback(async () => {
    setShowConfirm(false);
    setAdjusting(true);
    let adjusted = 0;
    let errors = 0;

    for (const item of items) {
      const diff = getDifference(item);
      if (diff === 0) continue;

      const result = await inventoryService.adjustStock({
        productId: item.productId,
        quantity: diff,
        reasonType: 'ajuste_manual',
        reason: 'Ajuste por cierre de caja',
        userId,
        tenantId,
      });

      if (result.ok) adjusted++;
      else errors++;
    }

    if (adjusted > 0) {
      addToast({ type: 'success', message: `Stock ajustado de ${adjusted} producto${adjusted > 1 ? 's' : ''}.`, duration: 3000 });
    }
    if (errors > 0) {
      addToast({ type: 'error', message: `Error al ajustar ${errors} producto${errors > 1 ? 's' : ''}. Verifica tu conexión e intenta de nuevo.`, duration: 4000 });
    }

    setAdjusting(false);
    onComplete();
  }, [items, userId, tenantId, addToast, onComplete]);

  const footerContent = !loading && !error && items.length > 0 ? (
    showExcessiveConfirm ? (() => {
      const excessiveItems = getExcessiveItems();
      return (
        <div className="w-full space-y-3">
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-warning text-center">
              Stock físico mayor al esperado
            </p>
            <ul className="text-xs text-gray-600 text-left max-h-20 overflow-y-auto space-y-0.5">
              {excessiveItems.map((item) => {
                const logical = getLogicalDisplay(item);
                const physical = parseFloat(item.physicalInput);
                const pct = logical > 0 ? Math.round(((physical - logical) / logical) * 100) : 0;
                return (
                  <li key={item.productId} className="flex justify-between">
                    <span className="truncate">{item.productName}</span>
                    <span className="ml-2 font-mono">Registrado: {logical} &rarr; Físico: {physical}{logical > 0 ? ` (+${pct}%)` : ''}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-gray-500 text-center">¿Estás seguro de confirmar esta diferencia?</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" size="sm" onClick={() => setShowExcessiveConfirm(false)}>Corregir</Button>
            <Button variant="primary" size="sm" onClick={() => { setShowExcessiveConfirm(false); setShowConfirm(true); }}>Confirmar exceso</Button>
          </div>
        </div>
      );
    })()
    : showConfirm ? (
      (() => {
        const zeroedItems = items.filter((item) => {
          const logical = getLogicalDisplay(item);
          const physical = parseFloat(item.physicalInput);
          return !isNaN(physical) && physical === 0 && logical > 0;
        });
        return (
          <div className={`w-full space-y-3 ${zeroedItems.length > 0 ? '' : ''}`}>
            <div className={`rounded-lg p-3 space-y-2 ${zeroedItems.length > 0 ? 'bg-danger/10 border border-danger/20' : 'bg-warning/10 border border-warning/20'}`}>
              {zeroedItems.length > 0 ? (
                <>
                  <p className="text-xs font-medium text-danger text-center">
                    {zeroedItems.length} producto{zeroedItems.length > 1 ? 's' : ''} con stock físico en 0 pero con stock registrado mayor a 0:
                  </p>
                  <ul className="text-xs text-gray-600 text-left max-h-20 overflow-y-auto space-y-0.5">
                    {zeroedItems.map((item) => (
                      <li key={item.productId} className="flex justify-between">
                        <span className="truncate">{item.productName}</span>
                        <span className="shrink-0 ml-2 font-mono">Stock registrado: {getLogicalDisplay(item)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 text-center">¿Estás seguro de querer ajustar a 0 estos productos?</p>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-medium text-warning">Los ajustes se aplicarán de inmediato y no se pueden deshacer.</p>
                  <p className="text-xs text-gray-500 mt-1">{pendingChanges} producto{pendingChanges > 1 ? 's' : ''} con diferencia{pendingChanges > 1 ? 's' : ''} serán modificados.</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={handleAdjustAll} loading={adjusting}>Confirmar ajustes</Button>
            </div>
          </div>
        );
      })()
    ) : (
      <div className="flex gap-2 justify-end w-full">
        <Button variant="ghost" size="sm" onClick={onComplete}>Saltar</Button>
        <Button variant="primary" size="sm" onClick={() => {
          if (getExcessiveItems().length > 0) {
            setShowExcessiveConfirm(true);
          } else {
            setShowConfirm(true);
          }
        }} disabled={pendingChanges === 0}>
          {pendingChanges > 0 ? `Ajustar todo (${pendingChanges})` : 'Sin cambios'}
        </Button>
      </div>
    )
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verificar inventario físico"
      size="lg"
      footer={footerContent}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-danger mb-4">{error}</p>
          <Button variant="primary" onClick={loadProducts}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No hay productos para verificar.</p>
          <Button variant="primary" onClick={onComplete}>Continuar</Button>
        </div>
      ) : (
        <div className="space-y-3 animate-slide-down">
          <p className="text-sm text-gray-500">
            Verifica el stock físico de {items.length} producto{items.length > 1 ? 's' : ''}.
            {pendingChanges > 0 && (
              <span className="text-warning font-medium"> ({pendingChanges} pendiente{pendingChanges > 1 ? 's' : ''} de ajuste)</span>
            )}
          </p>

          <div className="space-y-3">
            {items.map((item, index) => {
              const diff = getDifference(item);
              return (
                <div key={item.productId} style={{ animationDelay: `${index * 0.05}s` }} className="animate-card-in bg-surface-alt rounded-lg p-3 space-y-2 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-tight truncate">{item.productName}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {item.soldToday > 0 && `Vendido: ${displayQty(item.soldToday, item.unit)}`}
                        {item.isLowStock && !item.isZeroStock && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-warning/10 text-warning px-1.5 py-0.5 rounded-full ml-1">Bajo stock</span>}
                        {item.isZeroStock && <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-danger/10 text-danger px-1.5 py-0.5 rounded-full ml-1">Agotado</span>}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${diff > 0 ? 'bg-success/10 text-success' : diff < 0 ? 'bg-danger/10 text-danger' : 'bg-gray-100 text-gray-400'}`}>
                      {diff > 0 ? '+' : ''}{displayQty(diff, item.unit)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-xs text-gray-600 font-medium uppercase tracking-wide">Stock registrado</label>
                      <p className="text-sm font-mono font-semibold mt-0.5">{displayQty(item.logicalStock, item.unit)}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 font-medium uppercase tracking-wide">Stock físico</label>
                      <Input
                        sanitize="number"
                        decimals={item.isWeighted ? 2 : 0}
                        inputMode="decimal"
                        value={item.physicalInput}
                        onChange={(e) => handlePhysicalChange(item.productId, e.target.value)}
                        validation={{ required: 'Ingresa el stock físico', min: 0, max: 999999 }}
                        inputClassName="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 font-medium uppercase tracking-wide">Diferencia</label>
                      <p className={`text-sm font-mono font-semibold mt-0.5 ${diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : ''}`}>
                        {diff > 0 ? '+' : ''}{displayQty(diff, item.unit)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
