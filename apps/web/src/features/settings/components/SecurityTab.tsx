import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Card, Input, Button, Alert } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { settingsService } from '../services/settingsService';
import { useAuthStore } from '../../auth/stores/authStore';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const emptyForm: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function SecurityTab() {
  const { addToast } = useToastStore();
  const userId = useAuthStore((s) => s.session?.userId);

  const [form, setForm] = useState<PasswordForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const getFieldError = (): string | null => {
    if (form.newPassword.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(form.newPassword)) return 'Debe contener al menos una mayuscula.';
    if (!/[a-z]/.test(form.newPassword)) return 'Debe contener al menos una minuscula.';
    if (!/\d/.test(form.newPassword)) return 'Debe contener al menos un numero.';
    if (!/[!@#$%^&*]/.test(form.newPassword)) return 'Debe contener al menos un simbolo (!@#$%^&*).';
    if (form.newPassword !== form.confirmPassword) return 'Las contraseñas no coinciden.';
    return null;
  };

  const handleSubmit = async () => {
    setError(null);

    if (!form.currentPassword) {
      setError('Debes ingresar tu contraseña actual.');
      return;
    }

    const fieldError = getFieldError();
    if (fieldError) {
      setError(fieldError);
      return;
    }

    if (!userId) {
      setError('No hay sesión activa.');
      return;
    }

    setSubmitting(true);
    const result = await settingsService.changePassword(userId, {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    setSubmitting(false);

    if (result.ok) {
      addToast({ type: 'success', message: 'Contraseña cambiada exitosamente.', duration: 4000 });
      setForm(emptyForm);
    } else {
      setError(result.error.message);
    }
  };

  return (
    <Card>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Cambiar Contraseña</h2>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <Input
          label="Contraseña actual"
          type="password"
          value={form.currentPassword}
          onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
          autoComplete="current-password"
        />

        <Input
          label="Nueva contraseña"
          type="password"
          value={form.newPassword}
          onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
          hint="Mín. 8 caracteres: mayúscula, minúscula, número y símbolo"
          autoComplete="new-password"
        />

        <Input
          label="Confirmar nueva contraseña"
          type="password"
          value={form.confirmPassword}
          onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
          autoComplete="new-password"
        />

        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          className="min-h-11"
        >
          Cambiar contraseña
        </Button>
      </div>
    </Card>
  );
}
