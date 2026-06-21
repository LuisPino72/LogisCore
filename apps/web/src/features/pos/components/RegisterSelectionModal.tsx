import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Spinner, Input } from '../../../common/components';
import { adminService } from '../../admin/services/adminService';
import { posService } from '../services/posService';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { useExchangeRateStore } from '../../exchange/stores/exchangeRateStore';
import { getDb } from '../../../services/dexie/db';
import type { DexieRegisterConfig } from '../../../services/dexie/db';
import { logger } from '../../../lib/logger';

interface RegisterSelectionModalProps {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (registerId: string, sessionId: string, name: string) => void;
}

type OccupiedInfo = { operatorId: string; isCurrentUser: boolean } | null;

export function RegisterSelectionModal({ tenantId, isOpen, onClose, onSuccess }: RegisterSelectionModalProps) {
  const [registers, setRegisters] = useState<DexieRegisterConfig[]>([]);
  const [occupiedMap, setOccupiedMap] = useState<Record<string, OccupiedInfo>>({});
  const [loading, setLoading] = useState(true);
  const [openingFor, setOpeningFor] = useState<DexieRegisterConfig | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = useAuthStore((s) => s.session);
  const setActiveRegister = usePosStore((s) => s.setActiveRegister);

  const loadRegisters = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.getRegisters(tenantId);
      if (!result.ok) {
        setRegisters([]);
        setLoading(false);
        return;
      }
      const active = result.data.filter((r) => r.isActive);
      setRegisters(active);

      const db = getDb();
      const occMap: Record<string, OccupiedInfo> = {};
      for (const reg of active) {
        const openSession = await db.cashRegisters
          .where({ registerId: reg.id, isOpen: true })
          .filter((r) => !r.deletedAt)
          .first();
        if (openSession) {
          const operatorId = openSession.operatorId || openSession.openedBy || '';
          occMap[reg.id] = {
            operatorId,
            isCurrentUser: operatorId === session?.userId,
          };
        } else {
          occMap[reg.id] = null;
        }
      }
      setOccupiedMap(occMap);
    } catch (err) {
      logger.error('RegisterSelectionModal', 'load failed', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, session?.userId]);

  useEffect(() => {
    if (isOpen) {
      loadRegisters();
      setOpeningFor(null);
      setOpeningBalance('');
      setOpeningError(null);
    }
  }, [isOpen, loadRegisters]);

  const handleOpenClick = useCallback(async () => {
    if (!openingFor || !session) return;
    const parsedBalance = parseFloat(openingBalance);
    if (!parsedBalance || parsedBalance <= 0) {
      setOpeningError('Ingresa un monto inicial mayor a 0.');
      return;
    }
    setOpeningError(null);
    setSubmitting(true);

    const rate = useExchangeRateStore.getState().rate;
    if (!rate || rate <= 0) {
      setOpeningError('No hay tasa de cambio disponible. Configúrala antes de abrir la caja.');
      setSubmitting(false);
      return;
    }

    const result = await posService.openCashRegister({
      tenantId,
      userId: session.userId,
      openingBalanceBs: parsedBalance,
      openingRate: rate,
      registerId: openingFor.id,
    });

    if (result.ok) {
      const reg = result.data;
      setActiveRegister(openingFor.id, reg.id, openingFor.name);
      onSuccess(openingFor.id, reg.id, openingFor.name);
      setOpeningFor(null);
      setOpeningBalance('');
    } else {
      setOpeningError(result.error?.message ?? 'Error al abrir la caja.');
    }
    setSubmitting(false);
  }, [openingFor, session, tenantId, openingBalance, setActiveRegister, onSuccess]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Seleccionar Caja" size="md">
      <div className="flex flex-col gap-4 animate-slide-down">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : registers.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm">
            No hay cajas configuradas. Pídele al administrador que cree una caja.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {registers.map((reg) => {
              const occupied = occupiedMap[reg.id];
              const isOccupied = occupied !== null;
              return (
                <div
                  key={reg.id}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    isOccupied
                      ? 'border-danger/30 bg-danger/5 opacity-70 cursor-not-allowed'
                      : 'border-primary/20 bg-white hover:border-primary/40 hover:shadow-md cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!isOccupied) {
                      setOpeningFor(reg);
                      setOpeningBalance('');
                      setOpeningError(null);
                    }
                  }}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    isOccupied ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'
                  }`}>
                    {reg.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-center leading-tight">{reg.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isOccupied
                      ? 'bg-danger/10 text-danger'
                      : 'bg-success/10 text-success'
                  }`}>
                    {isOccupied ? 'Ocupada' : 'Disponible'}
                  </span>
                  {isOccupied && (
                    <span className="text-[10px] text-text-secondary text-center">
                      {occupied.isCurrentUser ? 'Abierta por ti' : 'Abierta por otro operador'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {openingFor && (
          <div className="border-t border-border pt-4 animate-slide-down">
            <p className="text-sm font-semibold mb-3">
              Abrir: <span className="text-primary">{openingFor.name}</span>
            </p>
            <Input
              label="Monto inicial (Bs)"
              sanitize="currency"
              inputMode="decimal"
              autoComplete="off"
              value={openingBalance}
              onChange={(e) => { setOpeningBalance(e.target.value); setOpeningError(null); }}
              placeholder="0.00"
            />
            {openingError && (
              <p className="text-xs text-danger mt-1">{openingError}</p>
            )}
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="ghost" onClick={() => setOpeningFor(null)} disabled={submitting}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleOpenClick} loading={submitting} className="min-h-11">
                Abrir Caja
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
