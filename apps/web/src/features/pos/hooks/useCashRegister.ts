import { usePosStore } from '../stores/posStore';

export function useCashRegister() {
  const cashRegister = usePosStore((s) => s.cashRegister);
  const loading = usePosStore((s) => s.loading);

  return {
    cashRegister,
    isOpen: cashRegister?.isOpen ?? false,
    loading,
  };
}
