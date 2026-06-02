import { z } from 'zod';

/** Auth Spec - AUTH-001..003 */

export const LoginInputSchema = z.object({
  email: z.string().email('Email inválido').max(30),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(30)
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const AUTH_ROUTES = {
  LOGIN: '/login',
  ADMIN: '/admin',
  DASHBOARD: '/dashboard',
} as const;

export type AuthRoute = (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES];
