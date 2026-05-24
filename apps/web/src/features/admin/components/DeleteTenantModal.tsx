import { useState, useEffect } from 'react';
import { Alert, Modal, Input, Button } from '../../../common/components';
import type { Tenant } from '../types';

interface DeleteTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onSoftDelete: (id: string) => Promise<unknown>;
  onHardDelete: (id: string) => Promise<unknown>;
}

export function DeleteTenantModal({ isOpen, onClose, tenant, onSoftDelete, onHardDelete }: DeleteTenantModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!tenant) return null;

  const isHardDelete = !!tenant.deletedAt;

  const handleDelete = async () => {
    setIsDeleting(true);
    if (isHardDelete) {
      await onHardDelete(tenant.id);
    } else {
      await onSoftDelete(tenant.id);
    }
    setIsDeleting(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isHardDelete ? 'Eliminar permanentemente' : 'Desactivar local'}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          {isHardDelete ? (
            <Button
              variant="danger"
              fullWidth
              disabled={confirmText !== 'BORRAR' || isDeleting}
              loading={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar permanentemente'}
            </Button>
          ) : (
            <Button variant="danger" fullWidth onClick={handleDelete} loading={isDeleting}>
              {isDeleting ? 'Desactivando...' : 'Desactivar'}
            </Button>
          )}
        </div>
      }
    >
      {isHardDelete ? (
        <div className="space-y-4">
          <Alert variant="error">
            ¡ATENCIÓN! Esta acción <strong>NO se puede deshacer</strong>. Se borrarán <strong>todos los datos</strong> del local en cascada:
          </Alert>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Productos, categorías e imágenes</li>
            <li>Ventas, items de venta e historial</li>
            <li>Inventario, movimientos y lotes</li>
            <li>Proveedores, órdenes de compra</li>
            <li>Usuarios y roles del local</li>
            <li>Suscripciones y tasas de cambio</li>
          </ul>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium text-gray-700">Local:</span> {tenant.name}</p>
            <p><span className="font-medium text-gray-700">Slug:</span> {tenant.slug}</p>
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
      ) : (
        <div className="space-y-4">
          <Alert variant="warning">
            Esto desactivará el local y ocultará todos sus datos. Podrás reactivarlo después si es necesario.
          </Alert>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium text-gray-700">Local:</span> {tenant.name}</p>
            <p><span className="font-medium text-gray-700">Slug:</span> {tenant.slug}</p>
            <p><span className="font-medium text-gray-700">RIF:</span> {tenant.rif}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
