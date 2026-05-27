import { useMemo } from 'react';
import { Modal, Badge } from '../../../common/components';
import type { Product } from '../../../specs/inventory';
import type { Presentation } from '../../../specs/inventory';
import type { PresentationSelection } from '../types';
import { formatUsd } from '@/lib/formatBs';

interface PresentationSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  presentations: Presentation[];
  onSelect: (product: Product, selection: PresentationSelection) => void;
}

export function PresentationSelector({
  isOpen,
  onClose,
  product,
  presentations,
  onSelect,
}: PresentationSelectorProps) {
  const sorted = useMemo(
    () => [...presentations].sort((a, b) => a.sortOrder - b.sortOrder),
    [presentations],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product?.name ?? 'Seleccionar presentación'}
    >
      <div className="space-y-2 pt-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No hay presentaciones disponibles para este producto.</p>
        ) : sorted.map((pres) => {
          let stockDisplay = '—';
          let hasStock = true;

          if (product) {
            const perUnit = pres.unitMultiplier || 1;
            const available = Math.floor(product.stock / perUnit);
            stockDisplay = `${available} und.`;
            hasStock = available > 0;
          }

          return (
            <button
              key={pres.id}
              type="button"
              disabled={!hasStock}
              onClick={() => {
                if (product) {
                  if (!pres.id) return;
                  onSelect(product, {
                    id: pres.id,
                    name: pres.name,
                    priceUsd: pres.priceUsd,
                    unitMultiplier: pres.unitMultiplier,
                  });
                  onClose();
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all min-h-14 ${
                hasStock
                  ? 'bg-white border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer active:scale-[0.98]'
                  : 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium text-gray-800">
                  {pres.name}
                </span>
                <span className="text-[10px] text-text-muted">
                  Stock: {stockDisplay}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">
                  {formatUsd(pres.priceUsd)}
                </span>
                {!hasStock && (
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">
                    Sin stock
                  </Badge>
                )}
                {pres.unitMultiplier > 1 && (
                  <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">
                    x{pres.unitMultiplier}
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
