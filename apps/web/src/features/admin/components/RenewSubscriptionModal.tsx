import { useState, useEffect } from 'react';
import { Modal, Button } from '../../../common/components';

interface RenewSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName: string;
  expiresAt: string | null;
  onConfirm: () => Promise<unknown>;
}

export function RenewSubscriptionModal({ isOpen, onClose, tenantName, expiresAt, onConfirm }: RenewSubscriptionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    await onConfirm();
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Renovar suscripción"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={handleConfirm} loading={isSubmitting}>
            Confirmar renovación
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          ¿Estás seguro de que quieres renovar la suscripción de{' '}
          <strong>{tenantName}</strong> por 30 días?
        </p>
        {expiresAt && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <span className="font-medium">Vencimiento actual:</span>{' '}
            {new Date(expiresAt).toLocaleDateString('es-ES')}
          </div>
        )}
      </div>
    </Modal>
  );
}
