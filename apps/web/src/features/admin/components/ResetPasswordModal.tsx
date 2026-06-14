import { useState, useEffect } from 'react';
import { type Result, type AppError } from '@logiscore/core';
import { Alert, Modal, Input, Button } from '../../../common/components';
import { ResetPasswordSchema } from '../types';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
  userId: string;
  onReset: (userId: string, newPassword: string) => Promise<Result<void, AppError>>;
}

export function ResetPasswordModal({ isOpen, onClose, userEmail, userName, userId, onReset }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setError(null);
      setIsResetting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setError(null);
    const parsed = ResetPasswordSchema.safeParse({ userId, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Datos inválidos.');
      return;
    }
    setIsResetting(true);
    const result = await onReset(parsed.data.userId, parsed.data.newPassword);
    setIsResetting(false);
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
      title={`Restablecer contraseña: ${userName}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isResetting}>
            Cancelar
          </Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} loading={isResetting}>
            {isResetting ? 'Restableciendo...' : 'Restablecer'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 animate-slide-down">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="bg-surface-alt rounded-lg p-3 text-sm space-y-1">
          <p><span className="font-medium text-gray-700">Email:</span> {userEmail}</p>
          <p><span className="font-medium text-gray-700">Usuario:</span> {userName}</p>
        </div>
        <Input
          label="Nueva contraseña"
          type="password"
          showPassword
          placeholder="Mínimo 8 caracteres"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          validation={{ required: true, minLength: 8, maxLength: 20 }}
          hint="Mín. 8 caracteres: mayúscula, minúscula, número y símbolo"
        />
      </div>
    </Modal>
  );
}
