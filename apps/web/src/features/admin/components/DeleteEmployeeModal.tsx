import { useState, useEffect } from 'react';
import { Alert, Modal, Button } from '../../../common/components';

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
      <div className="space-y-4">
        <Alert variant="warning">
          ¿Estás seguro de que quieres eliminar a <strong>{employeeName}</strong>?
        </Alert>
        <p className="text-sm text-gray-600">
          Esta acción desactivará al empleado. No podrá acceder al sistema hasta que un administrador lo reactive.
        </p>
      </div>
    </Modal>
  );
}
