import { Package, Plus, Minus } from 'lucide-react';
import { Button, Modal, Input, SearchableSelect, Alert } from '../../../common/components';
import type { AdjustmentReason, Product } from '../types';
import { displayQty } from '../types';

const REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
  { value: 'inventario_inicial', label: 'Error de ingreso inicial' },
  { value: 'perdida', label: 'Pérdida' },
  { value: 'robo', label: 'Robo' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'consumo_interno', label: 'Consumo interno' },
  { value: 'otros', label: 'Otros' },
];

interface StockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | undefined;
  adjMode: '' | 'sumar' | 'restar';
  adjQuantity: string;
  adjReasonType: string;
  adjCostTotal: string;
  adjShowCostInput: boolean;
  adjHasCost: boolean;
  adjError: string;
  adjSubmitting: boolean;
  isOnline: boolean;
  onSetMode: (mode: '' | 'sumar' | 'restar') => void;
  onSetQuantity: (qty: string) => void;
  onSetReasonType: (reason: string) => void;
  onSetCostTotal: (cost: string) => void;
  onSetShowCostInput: (show: boolean) => void;
  onSetError: (error: string) => void;
  onSubmit: () => void;
}

export function StockAdjustmentModal({
  open, onClose, product, adjMode, adjQuantity, adjReasonType, adjCostTotal,
  adjShowCostInput, adjHasCost, adjError, adjSubmitting, isOnline,
  onSetMode, onSetQuantity, onSetReasonType, onSetCostTotal,
  onSetShowCostInput, onSetError, onSubmit,
}: StockAdjustmentModalProps) {
  const displayStockValue = product ? displayQty(product.stock, product.unit) : '';
  const unitLabel = product?.unit === 'kg' ? 'Kg' : product?.unit === 'lt' ? 'Lt' : product?.unit === 'm' ? 'm' : '';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Ajuste de stock"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={onSubmit} disabled={adjSubmitting || !isOnline}>{adjSubmitting ? 'Ajustando...' : 'Ajustar stock'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {product && (
          <div className="bg-linear-to-br from-primary/4 to-primary/2 border border-primary/10 ring-1 ring-primary/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {product.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-xs font-medium text-primary">
                    Stock: {displayStockValue} {unitLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="input-label">Tipo de ajuste</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onSetMode(adjMode === 'sumar' ? '' : 'sumar');
                onSetQuantity('');
                onSetError('');
                onSetReasonType(adjMode === 'sumar' ? '' : 'inventario_inicial');
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                adjMode === 'sumar'
                  ? 'bg-success text-white shadow-sm'
                  : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
              }`}
            >
              <Plus size={16} />
              Sumar stock
            </button>
            <button
              type="button"
              onClick={() => {
                onSetMode(adjMode === 'restar' ? '' : 'restar');
                onSetQuantity('');
                onSetError('');
                onSetReasonType(adjMode === 'restar' ? '' : 'perdida');
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                adjMode === 'restar'
                  ? 'bg-danger text-white shadow-sm'
                  : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
              }`}
            >
              <Minus size={16} />
              Restar stock
            </button>
          </div>
        </div>

        {adjMode && (
          <div className="input-wrapper">
            <label className="input-label">Cantidad {adjMode === 'sumar' ? 'a sumar' : 'a restar'}</label>
            <Input
              sanitize="number"
              decimals={product?.isWeighted ? 2 : 0}
              inputMode={product?.isWeighted ? "decimal" : "numeric"}
              placeholder={product?.isWeighted ? "Ej: 10.5" : "Ej: 10"}
              value={adjQuantity}
              onChange={(e) => onSetQuantity(e.target.value)}
              validation={{ required: true, min: 0.01 }}
              error={adjError}
              inputClassName="text-sm"
            />
          </div>
        )}

        {adjMode && (
          <div className="input-wrapper">
            <label className="input-label">Motivo</label>
            <SearchableSelect
              value={adjReasonType}
              onChange={(v) => onSetReasonType(v)}
              options={REASON_OPTIONS.filter((o) =>
                adjMode === 'sumar'
                  ? o.value === 'inventario_inicial'
                  : o.value !== 'inventario_inicial'
              )}
              hideSearch
            />
          </div>
        )}

        {!adjHasCost && (
          <div className="space-y-2">
            <Alert variant="warning" className="text-xs">
              Este producto no tiene costo registrado. Los ajustes se registrarán con costo <strong>$0 por unidad</strong>.
            </Alert>
            {!adjShowCostInput && (
              <Button variant="outline" size="sm" onClick={() => onSetShowCostInput(true)}>
                Agregar costo total ($)
              </Button>
            )}
          </div>
        )}

        {adjShowCostInput && (
          <div className="input-wrapper">
            <label className="input-label">Costo total del ajuste ($)</label>
            <Input
              sanitize="currency"
              step="0.01"
              placeholder="0.00"
              value={adjCostTotal}
              onChange={(e) => onSetCostTotal(e.target.value)}
              validation={{ min: 0, max: 999999 }}
              inputClassName="text-sm"
              inputMode="decimal"
            />
            <p className="text-xs text-gray-600 mt-0.5">
              Costo total de las unidades que entran.
            </p>
          </div>
        )}

        {adjMode === 'sumar' && adjShowCostInput && adjCostTotal && parseFloat(adjCostTotal) > 0 && adjQuantity && parseFloat(adjQuantity) > 0 && product && (() => {
          const storageQty = product.isWeighted
            ? parseFloat(adjQuantity) * 1000
            : parseFloat(adjQuantity);
          const costPerUnit = storageQty > 0 ? parseFloat(adjCostTotal) / storageQty : 0;
          const prevCostStorage = product.isWeighted
            ? (product.costPrice ?? 0) / 1000
            : (product.costPrice ?? 0);
          const newStock = product.stock + storageQty;
          const totalCost = (product.stock * prevCostStorage) + (storageQty * costPerUnit);
          const newCostStorage = newStock > 0 ? totalCost / newStock : costPerUnit;
          const newCostPrice = product.isWeighted
            ? newCostStorage * 1000
            : newCostStorage;
          const hasPrevCost = (product.costPrice ?? 0) > 0;
          const unitLabel = product.unit === 'kg' ? '/kg' : product.unit === 'lt' ? '/lt' : product.unit === 'm' ? '/m' : '/und';

          return (
            <Alert variant="info" className="text-xs">
              {hasPrevCost ? (
                <>Este ajuste actualizará el costo promedio: <strong>${(product.costPrice ?? 0).toFixed(2)}{unitLabel}</strong> → <strong>${(Math.round(newCostPrice * 100) / 100).toFixed(2)}{unitLabel}</strong></>
              ) : (
                <>Se registrará un costo de <strong>${costPerUnit.toFixed(4)}</strong> por unidad de almacenamiento.</>
              )}
            </Alert>
          );
        })()}
      </div>
    </Modal>
  );
}
