import { useState, useEffect } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Modal, Input, Button } from '../../../common/components';
import type { GlobalCategory } from '../types';

interface GlobalCategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string | null; // Null means create mode, non-null means edit mode
  initialName: string;
  onSubmit: (name: string) => Promise<Result<GlobalCategory, AppError>>;
}

export function GlobalCategoryFormModal({ isOpen, onClose, categoryId, initialName, onSubmit }: GlobalCategoryFormModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = categoryId !== null;

  useEffect(() => {
    if (isOpen) {
      setName(isEdit ? initialName : '');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, isEdit, initialName]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Ingresa un nombre');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(name.trim());
    setIsSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar categoría global' : 'Nueva categoría global'}
    >
      <div className="space-y-4">
        <Input
          placeholder="Nombre de la categoría"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          validation={{ required: true, maxLength: 25 }}
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (isEdit ? 'Guardando...' : 'Creando...') : (isEdit ? 'Guardar' : 'Crear')}
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
