import { useState } from 'react';
import { Modal, Input, Button } from '../../../common/components';

interface ParkCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  loading: boolean;
}

export function ParkCartModal({ isOpen, onClose, onConfirm, loading }: ParkCartModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Ingrese un nombre o descripción.');
      return;
    }
    setError('');
    onConfirm(trimmed);
    setName('');
  };

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Poner venta en cola">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Guarda esta venta para atender a otros clientes y recuperarla después.
        </p>
        <Input
          label="Nombre / Descripción"
          placeholder="Ej: Cliente con tarjeta olvidada"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setError('');
            setName(e.target.value);
          }}
          error={error}
          validation={{ required: 'Indica un nombre', maxLength: 15 }}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm} loading={loading}>
            Guardar en cola
          </Button>
        </div>
      </div>
    </Modal>
  );
}
