import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
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
      <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-primary/20 bg-primary/10">
          <RefreshCw size={24} className="text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600">
            ¿Renovar la suscripción de <strong>{tenantName}</strong> por 30 días?
          </p>
        </div>
        {expiresAt && (
          <div className="w-full bg-surface-alt border border-border rounded-lg p-3 text-sm text-gray-600">
            <span className="font-medium">Vencimiento actual:</span>{' '}
            {new Date(expiresAt).toLocaleDateString('es-ES')}
          </div>
        )}
      </div>
    </Modal>
  );
}
