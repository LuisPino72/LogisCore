import { z } from 'zod';

/** Auth Spec - AUTH-001..003 */

export const LoginInputSchema = z.object({
  email: z.string().email('Email inválido').max(30),
  password: z.string().min(6, 'Debe tener al menos 6 caracteres').max(20),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const AUTH_ROUTES = {
  LOGIN: '/login',
  ADMIN: '/admin',
  DASHBOARD: '/dashboard',
} as const;

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES];
