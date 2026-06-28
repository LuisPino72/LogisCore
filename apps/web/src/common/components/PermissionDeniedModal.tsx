import { type FC } from 'react';
import { ShieldOff } from 'lucide-react';
import { Modal, Button } from '.';

interface PermissionDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

export const PermissionDeniedModal: FC<PermissionDeniedModalProps> = ({ isOpen, onClose, message }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Permiso requerido" size="sm">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-danger/10">
          <ShieldOff size={32} className="text-danger" />
        </div>
        <p className="text-gray-700 text-sm leading-relaxed max-w-xs">
          {message}
        </p>
        <p className="text-gray-500 text-xs">
          Contacta al administrador si crees que deberías tener acceso.
        </p>
      </div>
      <div className="mt-4">
        <Button variant="secondary" onClick={onClose} className="w-full min-h-11">
          Entendido
        </Button>
      </div>
    </Modal>
  );
};
