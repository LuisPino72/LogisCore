import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface DeleteEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  onConfirm: () => Promise<unknown>;
}

export function DeleteEmployeeModal({ isOpen, onClose, employeeName, onConfirm }: DeleteEmployeeModalProps) {
  return (
    <ConfirmDeleteModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Eliminar empleado"
      alertText={`¿Eliminar a <strong>${employeeName}</strong>? Esta acción desactivará al empleado. No podrá acceder al sistema hasta que un administrador lo reactive.`}
      confirmLabel="Eliminar"
    />
  );
}
