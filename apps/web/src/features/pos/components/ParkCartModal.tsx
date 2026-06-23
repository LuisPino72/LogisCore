import { useState, useEffect } from 'react';
import { Modal, Input, Button } from '../../../common/components';

interface ParkCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  loading: boolean;
  defaultTableNumber?: number;
}

export function ParkCartModal({ isOpen, onClose, onConfirm, loading, defaultTableNumber }: ParkCartModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && defaultTableNumber) {
      setName(`Mesa ${defaultTableNumber}`);
      setError('');
    } else if (isOpen && !defaultTableNumber) {
      setName('');
    }
  }, [isOpen, defaultTableNumber]);

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
    <Modal isOpen={isOpen} onClose={handleClose} title={defaultTableNumber ? `Mesa ${defaultTableNumber}` : 'Poner venta en cola'}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          {defaultTableNumber
            ? `Asigna productos a la Mesa ${defaultTableNumber}. Puedes cambiar el nombre si lo prefieres.`
            : 'Guarda esta venta para atender a otros clientes y recuperarla después.'}
        </p>
        <Input
          label={defaultTableNumber ? 'Nombre de la mesa / pedido' : 'Nombre / Descripción'}
          placeholder={defaultTableNumber ? `Mesa ${defaultTableNumber}` : 'Ej: Cliente con tarjeta olvidada'}
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
