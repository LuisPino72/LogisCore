import { z } from 'zod';

/** Auth Spec - AUTH-001..003 */

export const LoginInputSchema = z.object({
  email: z.string().email('Email inválido').max(20, 'Email máximo 20 caracteres'),
  password: z.string().min(6, 'Password mínimo 6 caracteres').max(20, 'Password máximo 20 caracteres'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export type UserRole = 'admin' | 'owner' | 'employee';

export interface UserSession {
  userId: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  tenantSlug?: string;
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
