import { Package } from 'lucide-react';
import { Modal, Button, Spinner } from '../../../common/components';

interface VerifyCounts {
  sold: number;
  lowStock: number;
}

interface VerifyConfirmModalProps {
  isOpen: boolean;
  loading: boolean;
  verifyCounts: VerifyCounts;
  isFromPreviousDay: boolean;
  onVerify: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function VerifyConfirmModal({ isOpen, loading, verifyCounts, isFromPreviousDay, onVerify, onSkip, onClose }: VerifyConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verificar inventario"
      size="sm"
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-slide-down">
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-primary/20 bg-primary/10">
              <Package size={24} className="text-primary" />
            </div>
            <p className="text-sm text-gray-600 text-center">
              Hay <strong>{verifyCounts.sold + verifyCounts.lowStock}</strong> producto{(verifyCounts.sold + verifyCounts.lowStock) > 1 ? 's' : ''} para verificar
              {verifyCounts.sold > 0 && <> (<strong>{verifyCounts.sold}</strong> vendido{verifyCounts.sold > 1 ? 's' : ''} {isFromPreviousDay ? 'ayer' : 'hoy'}</>}
              {verifyCounts.sold > 0 && verifyCounts.lowStock > 0 ? <>, </> : null}
              {verifyCounts.lowStock > 0 ? <><strong>{verifyCounts.lowStock}</strong> con bajo stock</> : null}
              {verifyCounts.sold > 0 ? <> )</> : null}.
              ¿Deseas verificar el stock físico antes de cerrar caja?
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={onSkip}>Solo cerrar</Button>
            <Button variant="primary" onClick={onVerify}>Verificar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
