import { useState, useEffect } from 'react';
import { Alert, Modal, Input, Button } from '../../../common/components';

interface DeleteGlobalCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  onConfirm: () => Promise<unknown>;
}

export function DeleteGlobalCategoryModal({ isOpen, onClose, categoryName, onConfirm }: DeleteGlobalCategoryModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
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
      title="Eliminar categoría global"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={confirmText !== 'BORRAR' || isDeleting}
            loading={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar permanentemente'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 animate-slide-down">
        <Alert variant="error">
          ¡ATENCIÓN! Esta acción eliminará la categoría global. Los locales que ya la tienen como predefinida conservarán su copia local, pero dejará de estar disponible para nuevos locales.
        </Alert>
        <div className="bg-surface-alt rounded-lg p-3 text-sm space-y-1">
          <p><span className="font-medium text-gray-700">Categoría:</span> {categoryName}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">
            Escribe <strong>BORRAR</strong> para confirmar:
          </p>
          <Input
            placeholder="BORRAR"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase().slice(0, 6))}
            validation={{ maxLength: 6 }}
          />
        </div>
      </div>
    </Modal>
  );
}
