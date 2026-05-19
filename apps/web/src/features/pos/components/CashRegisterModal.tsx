import { useState } from 'react';
import { Modal, Input, Button } from '../../../common/components';

type CashMode = 'open' | 'close';

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: CashMode;
  currentSalesCount: number;
  currentSalesBs: number;
  currentIgtfBs: number;
  openingBalanceBs: number | null;
  onOpenCash: (balance: number) => Promise<boolean>;
  onCloseCash: (declared: number) => Promise<boolean>;
  loading: boolean;
}

export function CashRegisterModal({
  isOpen,
  onClose,
  mode,
  currentSalesCount,
  currentSalesBs,
  currentIgtfBs,
  openingBalanceBs,
  onOpenCash,
  onCloseCash,
  loading,
}: CashRegisterModalProps) {
  const [balance, setBalance] = useState('');
  const [declaredClosing, setDeclaredClosing] = useState('');

  const handleOpen = async () => {
    const parsed = parseFloat(balance);
    if (!parsed || parsed <= 0) return;
    const ok = await onOpenCash(parsed);
    if (ok) {
      setBalance('');
      onClose();
    }
  };

  const handleClose = async () => {
    const parsed = parseFloat(declaredClosing);
    if (isNaN(parsed)) return;
    const ok = await onCloseCash(parsed);
    if (ok) {
      setDeclaredClosing('');
      onClose();
    }
  };

  const expectedClosing = (openingBalanceBs ?? 0) + currentSalesBs;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'open' ? 'Abrir Caja' : 'Cerrar Caja'}>
      <div className="flex flex-col gap-4">
        {mode === 'open' ? (
          <Input
            label="Monto inicial (Bs)"
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            validation={{ required: true, min: 0.01 }}
            placeholder="0.00"
          />
        ) : (
          <>
            <div className="bg-surface-alt rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Ventas realizadas</span>
                <span className="font-medium">{currentSalesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total vendido</span>
                <span className="font-medium">Bs {currentSalesBs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IGTF recaudado</span>
                <span className="font-medium">Bs {currentIgtfBs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span className="text-gray-700 font-medium">Cierre esperado</span>
                <span className="font-bold">Bs {expectedClosing.toFixed(2)}</span>
              </div>
            </div>
            <Input
              label="Monto final declarado (Bs)"
              type="number"
              inputMode="decimal"
              value={declaredClosing}
              onChange={(e) => setDeclaredClosing(e.target.value)}
              validation={{ required: true, min: 0 }}
              placeholder="0.00"
            />
          </>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={mode === 'open' ? 'primary' : 'danger'}
            onClick={mode === 'open' ? handleOpen : handleClose}
            loading={loading}
          >
            {mode === 'open' ? 'Abrir Caja' : 'Cerrar Caja'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
