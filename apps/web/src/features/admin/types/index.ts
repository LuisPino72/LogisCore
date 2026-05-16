import { z } from 'zod';

export const CreateTenantInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  rif: z.string().regex(/^[VJEGP]-\d{9}$/, 'RIF inválido formato J-123456789'),
  direccion: z.string().max(200).optional().default(''),
  telefono: z.string().regex(/^(\+58|0)\d{10}$/, 'Teléfono inválido').optional().default(''),
}).strict();

export type CreateTenantInput = z.infer<typeof CreateTenantInputSchema>;

export const CreateOwnerInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: z.string().min(6, 'Password mínimo 6 caracteres').max(20, 'Password máximo 20 caracteres'),
  name: z.string().min(1, 'Nombre requerido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
}).strict();

export type CreateOwnerInput = z.infer<typeof CreateOwnerInputSchema>;

export const CreateEmployeeInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: z.string().min(6, 'Password mínimo 6 caracteres').max(20, 'Password máximo 20 caracteres'),
  name: z.string().min(1, 'Nombre requerido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
}).strict();

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInputSchema>;

export const EdgeCreateUserSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: z.string().min(6, 'Password mínimo 6 caracteres').max(20, 'Password máximo 20 caracteres'),
  name: z.string().min(1, 'Nombre requerido'),
}).strict();

export type EdgeCreateUser = z.infer<typeof EdgeCreateUserSchema>;

export const CreateTenantWithUsersInputSchema = z.object({
  tenant: CreateTenantInputSchema,
  owner: EdgeCreateUserSchema,
  employees: z.array(EdgeCreateUserSchema).max(3).default([]),
}).strict();

export type CreateTenantWithUsersInput = z.infer<typeof CreateTenantWithUsersInputSchema>;

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  rif: string;
  direccion?: string;
  telefono?: string;
  plan: string;
  createdAt: string;
  deletedAt?: string;
}

export interface UserRole {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'employee';
  createdAt: string;
}

export interface CreateTenantResponse {
  tenant: Tenant;
  owner: { id: string; email: string; name: string };
  employees: Array<{ id: string; email: string; name: string }>;
}

export interface GlobalUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'employee';
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  createdAt: string;
}

export interface SubscriptionView {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  daysRemaining: number;
}
