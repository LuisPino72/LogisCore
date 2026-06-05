import { z } from 'zod';

/** Auth Spec - AUTH-001..003 */

export const LoginInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(100)
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export type UserRole = 'admin' | 'owner' | 'employee';

export interface UserSession {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  tenantSlug?: string;
  // BACKLOG-106 [AUTH-002]: Permisos del rol (modules[] desde rolePermissions).
  // Asignados por bootstrap retroactivo si role='employee' y no se setearon antes.
  permissions?: string[];
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: UserSession | null;
  error: import('@logiscore/core').AppError | null;
}

export const AUTH_ROUTES = {
  LOGIN: '/login',
  ADMIN: '/admin',
  DASHBOARD: ':slug/dashboard',
} as const;

export function validateLoginInput(input: unknown): LoginInput {
  return LoginInputSchema.parse(input);
}

export function isValidRole(role: unknown): role is UserRole {
  return role === 'admin' || role === 'owner' || role === 'employee';
}
