import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '../../../common/components';

interface DeleteEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  onConfirm: () => Promise<unknown>;
}

export function DeleteEmployeeModal({ isOpen, onClose, employeeName, onConfirm }: DeleteEmployeeModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Eliminar empleado"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="danger" fullWidth onClick={handleDelete} loading={isDeleting}>
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
          <AlertTriangle size={24} className="text-danger" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">¿Eliminar a <strong>{employeeName}</strong>?</p>
          <p className="text-xs text-gray-500 mt-1">
            Esta acción desactivará al empleado. No podrá acceder al sistema hasta que un administrador lo reactive.
          </p>
        </div>
      </div>
    </Modal>
  );
}
