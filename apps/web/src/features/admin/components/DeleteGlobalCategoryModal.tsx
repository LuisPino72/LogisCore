import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface DeleteGlobalCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  onConfirm: () => Promise<unknown>;
}

export function DeleteGlobalCategoryModal({ isOpen, onClose, categoryName, onConfirm }: DeleteGlobalCategoryModalProps) {
  return (
    <ConfirmDeleteModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Eliminar categoría global"
      alertText="¡ATENCIÓN! Esta acción eliminará la categoría global. Los locales que ya la tienen como predefinida conservarán su copia local, pero dejará de estar disponible para nuevos locales."
      alertVariant="error"
      confirmLabel="Eliminar permanentemente"
    >
      <div className="bg-surface-alt rounded-lg p-3 text-sm space-y-1">
        <p><span className="font-medium text-gray-700">Categoría:</span> {categoryName}</p>
      </div>
    </ConfirmDeleteModal>
  );
}
