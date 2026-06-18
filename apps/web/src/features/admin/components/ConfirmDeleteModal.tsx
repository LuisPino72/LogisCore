import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, Modal, Input, Button } from '../../../common/components';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  title: string;
  message?: string;
  alertText?: string;
  alertVariant?: 'warning' | 'error';
  confirmLabel?: string;
  cancelLabel?: string;
  requireConfirmText?: boolean;
  confirmTextValue?: string;
  children?: React.ReactNode;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  alertText = 'Escribe <strong>BORRAR</strong> para confirmar esta acción.',
  alertVariant = 'warning',
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  requireConfirmText = true,
  confirmTextValue = 'BORRAR',
  children,
}: ConfirmDeleteModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onClose();
  };

  const isConfirmValid = !requireConfirmText || confirmInput === confirmTextValue;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isDeleting}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={!isConfirmValid || isDeleting}
            loading={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 animate-slide-down">
        {(message || alertText) && (
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
              <AlertTriangle size={24} className="text-danger" />
            </div>
          </div>
        )}
        {alertText && <Alert variant={alertVariant}>{alertText}</Alert>}
        {message && <p className="text-sm text-gray-600 text-center">{message}</p>}
        {children}
        {requireConfirmText && (
          <div>
            <p className="text-sm text-gray-600 mb-1">
              Escribe <strong>{confirmTextValue}</strong> para confirmar:
            </p>
            <Input
              placeholder={confirmTextValue}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value.toUpperCase().slice(0, confirmTextValue.length))}
              validation={{ maxLength: confirmTextValue.length }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
