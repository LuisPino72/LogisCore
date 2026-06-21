import { AlertTriangle } from 'lucide-react';
import { Button, Modal, Input } from '../../../common/components';
import { formatUsd } from '../../../lib/formatBs';
import type { Product } from '../types';

type BulkPriceMode = 'percentage' | 'fixed_amount' | 'fixed_price';

interface BulkPriceUpdateModalProps {
  open: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  bulkPrice: {
    showModal: boolean;
    showConfirm: boolean;
    selectedIds: string[];
    mode: BulkPriceMode;
    value: string;
    submitting: boolean;
    error: string;
    preview: { productId: string; name: string; currentPrice: number; newPrice: number }[];
    impact: { totalProducts: number; productsWithPrice: number; productsSkipped: number; isDecreasing: boolean } | null;
    closeModal: () => void;
    proceedToConfirm: () => void;
    backToForm: () => void;
    setMode: (mode: BulkPriceMode) => void;
    setValue: (value: string) => void;
    handleSubmit: () => Promise<{ success: number; skipped: number; failed: number }>;
  };
  isOnline: boolean;
}

export function BulkPriceUpdateModal({ open, onClose, selectedProducts, bulkPrice, isOnline }: BulkPriceUpdateModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={bulkPrice.showConfirm ? 'Confirmar cambios' : 'Actualizar precios'}
      footer={
        bulkPrice.showConfirm ? (
          <div className="flex gap-3 w-full">
            <Button variant="ghost" fullWidth onClick={bulkPrice.backToForm} disabled={bulkPrice.submitting}>
              Volver
            </Button>
            <Button variant="primary" fullWidth onClick={bulkPrice.handleSubmit} disabled={bulkPrice.submitting || !isOnline}>
              {bulkPrice.submitting ? 'Actualizando...' : `Confirmar ${bulkPrice.impact?.productsWithPrice || 0} cambios`}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 w-full">
            <Button variant="ghost" fullWidth onClick={bulkPrice.closeModal} disabled={bulkPrice.submitting}>
              Cancelar
            </Button>
            <Button variant="primary" fullWidth onClick={bulkPrice.proceedToConfirm} disabled={bulkPrice.submitting || !isOnline}>
              Revisar cambios
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {!bulkPrice.showConfirm ? (
          <>
            <div className="bg-gray-50 rounded-xl p-3 max-h-[25vh] overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-2">{bulkPrice.selectedIds.length} producto(s) seleccionado(s)</p>
              <div className="space-y-1.5">
                {selectedProducts.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <span className="text-gray-700 truncate min-w-0 flex-1 mr-2">{p.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{p.priceUsd > 0 ? formatUsd(p.priceUsd) : 'Sin precio'}</span>
                  </div>
                ))}
                {bulkPrice.selectedIds.length > 8 && (
                  <p className="text-xs text-gray-400 text-center pt-1">+{bulkPrice.selectedIds.length - 8} más</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="input-label">Tipo de ajuste</label>
              <div className="flex gap-2">
                {([
                  { key: 'percentage' as const, label: 'Porcentaje', icon: '%', desc: 'Aumentar o reducir por %' },
                  { key: 'fixed_amount' as const, label: 'Monto fijo', icon: '+', desc: 'Sumar o restar $' },
                  { key: 'fixed_price' as const, label: 'Precio fijo', icon: '=', desc: 'Establecer precio exacto' },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { bulkPrice.setMode(opt.key); bulkPrice.setValue(''); }}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-medium transition-all duration-200 min-h-[44px] ${
                      bulkPrice.mode === opt.key
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-50 text-text-secondary hover:bg-gray-100 border border-border'
                    }`}
                    title={opt.desc}
                  >
                    <span className="block text-base font-bold mb-0.5">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="input-wrapper">
              <label className="input-label">
                {bulkPrice.mode === 'percentage' ? 'Porcentaje' : bulkPrice.mode === 'fixed_amount' ? 'Monto en $' : 'Nuevo precio en $'}
              </label>
              <Input
                sanitize="currency"
                decimals={2}
                inputMode="decimal"
                placeholder={bulkPrice.mode === 'percentage' ? 'Ej: 10' : 'Ej: 0.50'}
                value={bulkPrice.value}
                onChange={(e) => { bulkPrice.setValue(e.target.value); }}
                validation={{ required: true, min: 0.01, max: bulkPrice.mode === 'percentage' ? 500 : 999999 }}
                error={bulkPrice.error}
                inputClassName="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {bulkPrice.mode === 'percentage' && 'Ej: 10 = $1.00 pasa a $1.10 · -5 = $1.00 pasa a $0.95'}
                {bulkPrice.mode === 'fixed_amount' && 'Ej: 0.50 = $1.00 pasa a $1.50 · -0.30 = $1.00 pasa a $0.70'}
                {bulkPrice.mode === 'fixed_price' && 'Ej: 3.00 = todos los precios quedan en $3.00'}
              </p>
            </div>

            {bulkPrice.preview.length > 0 && bulkPrice.impact && (
              <div className={`rounded-xl p-3 space-y-2 ${
                bulkPrice.impact.isDecreasing
                  ? 'bg-warning/5 border border-warning/20'
                  : 'bg-primary/5 border border-primary/10'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-medium ${bulkPrice.impact.isDecreasing ? 'text-warning' : 'text-primary'}`}>
                    {bulkPrice.impact.isDecreasing ? <><AlertTriangle size={14} className="inline mr-1" />Reduciendo precios</> : 'Vista previa'}
                  </p>
                  <span className="text-xs text-gray-500">
                    {bulkPrice.impact.productsWithPrice} de {bulkPrice.impact.totalProducts} productos
                    {bulkPrice.impact.productsSkipped > 0 && ` · ${bulkPrice.impact.productsSkipped} sin precio`}
                  </span>
                </div>
                {bulkPrice.impact.isDecreasing && (
                  <p className="text-xs text-warning-dark bg-warning/10 rounded-lg px-2 py-1.5">
                    Vas a reducir precios. Asegúrate de que es lo que quieres hacer.
                  </p>
                )}
                {bulkPrice.preview.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate min-w-0 flex-1 mr-2">{p.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-500">{formatUsd(p.currentPrice)}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <span className={`text-xs font-medium ${bulkPrice.impact?.isDecreasing ? 'text-warning' : 'text-primary'}`}>
                        {formatUsd(p.newPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 animate-slide-down">
            <div className={`flex items-start gap-3 p-3 rounded-xl ${
              bulkPrice.impact?.isDecreasing ? 'bg-warning/10' : 'bg-primary/5'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                bulkPrice.impact?.isDecreasing ? 'bg-warning/20' : 'bg-primary/10'
              }`}>
                <AlertTriangle size={20} className={bulkPrice.impact?.isDecreasing ? 'text-warning' : 'text-primary'} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {bulkPrice.impact?.isDecreasing ? '¿Reducir precios?' : '¿Actualizar precios?'}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Se actualizarán {bulkPrice.impact?.productsWithPrice} producto(s).
                  {bulkPrice.impact && bulkPrice.impact.productsSkipped > 0 && ` ${bulkPrice.impact.productsSkipped} sin precio serán omitidos.`}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 max-h-[35vh] overflow-y-auto space-y-1.5">
              {bulkPrice.preview.map((p) => (
                <div key={p.productId} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-700 truncate min-w-0 flex-1 mr-2">{p.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-500">{formatUsd(p.currentPrice)}</span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className={`text-xs font-bold ${bulkPrice.impact?.isDecreasing ? 'text-warning' : 'text-success'}`}>
                      {formatUsd(p.newPrice)}
                    </span>
                  </div>
                </div>
              ))}
              {bulkPrice.impact && bulkPrice.impact.totalProducts > 3 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  +{bulkPrice.impact.totalProducts - 3} productos más
                </p>
              )}
            </div>

            {bulkPrice.impact?.isDecreasing && (
              <div className="bg-danger/5 border border-danger/20 rounded-xl p-3">
                <p className="text-xs text-danger font-medium">
                  Esta acción reducirá los precios de venta. Los productos ya vendidos a precios anteriores no se verán afectados.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
