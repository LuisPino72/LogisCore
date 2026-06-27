import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '../../../common/components';

export interface VoidConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function VoidConfirmModal({ isOpen, onConfirm, onCancel }: VoidConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="¿Anular venta?"
      size="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm}>Sí, anular</Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <p className="text-sm text-gray-600 text-center">
          Se restaurará el stock de todos los productos de esta venta. Esta acción no se puede deshacer.
        </p>
      </div>
    </Modal>
  );
}
