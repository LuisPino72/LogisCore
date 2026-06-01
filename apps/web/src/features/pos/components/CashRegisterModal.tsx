import { useState } from 'react';
import { Alert, Modal, Input, Button } from '../../../common/components';
import { formatBs } from '@/lib/formatBs';
import type { Result, AppError } from '@logiscore/core';

type CashMode = 'open' | 'close';

interface CashRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: CashMode;
  currentSalesCount: number;
  currentSalesBs: number;
  currentIgtfBs: number;
  openingBalanceBs: number | null;
  exchangeRate: number | null;
  onOpenCash: (balance: number) => Promise<Result<void, AppError>>;
  onCloseCash: (declared: number) => Promise<Result<void, AppError>>;
  error?: string | null;
  loading: boolean;
  disabled?: boolean;
}

export function CashRegisterModal({
  isOpen,
  onClose,
  mode,
  currentSalesCount,
  currentSalesBs,
  openingBalanceBs,
  exchangeRate,
  onOpenCash,
  onCloseCash,
  error,
  loading,
  disabled,
}: CashRegisterModalProps) {
  const [balance, setBalance] = useState('');
  const [declaredClosing, setDeclaredClosing] = useState('');
  const [localError, setLocalError] = useState('');

  const handleOpen = async () => {
    const parsed = parseFloat(balance);
    if (!parsed || parsed <= 0) {
      setLocalError('Ingresa el monto inicial de la caja.');
      return;
    }
    setLocalError('');
    const result = await onOpenCash(parsed);
    if (result.ok) {
      setBalance('');
      onClose();
    }
  };

  const handleClose = async () => {
    const parsed = parseFloat(declaredClosing);
    if (isNaN(parsed) || parsed < 0) {
      setLocalError('Ingresa el monto final declarado.');
      return;
    }
    setLocalError('');
    const result = await onCloseCash(parsed);
    if (result.ok) {
      setDeclaredClosing('');
      onClose();
    }
  };

  const expectedClosing = (openingBalanceBs ?? 0) + currentSalesBs;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'open' ? 'Abrir Caja' : 'Cerrar Caja'}>
      <div className="flex flex-col gap-4">
        {mode === 'open' ? (
          <>
            {exchangeRate && (
              <div className="bg-surface-alt rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tasa de cambio actual</span>
                  <span className="font-semibold">Bs {exchangeRate.toFixed(2)} / $</span>
                </div>
              </div>
            )}
            <Input
              label="Monto inicial (Bs)"
              sanitize="currency"
              value={balance}
              onChange={(e) => { setBalance(e.target.value); setLocalError(''); }}
              validation={{ required: true, min: 0.01 }}
              placeholder="0.00"
            />
          </>
        ) : (
          <>
            <div className="bg-surface-alt rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Ventas realizadas</span>
                <span className="font-medium">{currentSalesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total vendido</span>
                <span className="font-medium">{formatBs(currentSalesBs)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span className="text-gray-700 font-medium">Cierre esperado</span>
                <span className="font-bold">{formatBs(expectedClosing)}</span>
              </div>
            </div>
            <Input
              label="Monto final declarado (Bolívares)"
              sanitize="currency"
              value={declaredClosing}
              onChange={(e) => { setDeclaredClosing(e.target.value); setLocalError(''); }}
              validation={{ required: true, min: 0 }}
              placeholder="0.00"
            />
          </>
        )}

        {(error || localError) && (
          <Alert variant="error" className="p-3! text-sm">
            {error || localError}
          </Alert>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={mode === 'open' ? 'primary' : 'danger'}
            onClick={mode === 'open' ? handleOpen : handleClose}
            loading={loading}
            disabled={disabled}
            title={disabled ? 'Necesitas internet para realizar esta acción' : undefined}
          >
            {mode === 'open' ? 'Abrir Caja' : 'Cerrar Caja'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
