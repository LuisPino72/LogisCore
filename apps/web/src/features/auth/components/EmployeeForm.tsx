/**
 * BACKLOG-106 [AUTH-002]: EmployeeForm presentacional
 *
 * Componente reutilizable para crear empleados en cualquier tenant.
 * Simplificado: SOLO email + name + password (sin selector de rol).
 * Employee creado = rol 'employee' por default (POS-only).
 *
 * Props:
 * - onSubmit: callback async que recibe { email, name, password }
 * - isSubmitting: estado de loading externo
 * - error: error externo a mostrar
 */
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, Button } from '../../../common/components';
import { CreateEmployeeInputSchema } from '../types';
import type { Result } from '@logiscore/core';
import type { AppError } from '@logiscore/core';

interface EmployeeFormProps {
  onSubmit: (data: { email: string; name: string; password: string }) => Promise<Result<unknown, AppError>>;
  isSubmitting?: boolean;
  externalError?: string | null;
}

export function EmployeeForm({ onSubmit, isSubmitting = false, externalError }: EmployeeFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const parsed = CreateEmployeeInputSchema.safeParse({ email, name, password });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    const result = await onSubmit(parsed.data);
    if (!result.ok && result.error) {
      setValidationError(result.error.message);
    }
  };

  const errorMessage = validationError ?? externalError ?? null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nombre"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={25}
        required
        autoComplete="name"
      />
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={30}
        required
        autoComplete="email"
      />
      <div className="flex flex-col gap-1">
        <Input
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={14}
          required
          autoComplete="new-password"
          hint="Mín. 8 caracteres: mayúscula, minúscula, número y símbolo"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="text-gray-400 hover:text-gray-600 transition-colors self-start min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg"
          tabIndex={-1}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">{errorMessage}</p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creando…' : 'Crear empleado'}
      </Button>
    </form>
  );
}
