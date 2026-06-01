import { z } from 'zod';

export const CreateTenantInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  rif: z.string().regex(/^[VJEGP]\d{9}$/, 'RIF inválido formato J123456789'),
  direccion: z.string().max(200).optional().default(''),
  telefono: z.string().regex(/^(\+58|0)\d{10}$/, 'Teléfono inválido').optional().default(''),
}).strict();

export type CreateTenantInput = z.infer<typeof CreateTenantInputSchema>;

const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .max(100)
  .regex(/[A-Z]/, 'Debe contener una mayúscula')
  .regex(/[a-z]/, 'Debe contener una minúscula')
  .regex(/[0-9]/, 'Debe contener un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo');

export const CreateOwnerInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
}).strict();

export type CreateOwnerInput = z.infer<typeof CreateOwnerInputSchema>;

export const CreateEmployeeInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
}).strict();

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInputSchema>;

export const EdgeCreateUserSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido'),
}).strict();

export type EdgeCreateUser = z.infer<typeof EdgeCreateUserSchema>;

export const CreateTenantWithUsersInputSchema = z.object({
  tenant: CreateTenantInputSchema,
  owner: EdgeCreateUserSchema,
  employees: z.array(EdgeCreateUserSchema).max(3).default([]),
}).strict();

export type CreateTenantWithUsersInput = z.infer<typeof CreateTenantWithUsersInputSchema>;

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rif: z.string().regex(/^[VJEGP]\d{9}$/).optional(),
  direccion: z.string().max(200).optional(),
  telefono: z.string().regex(/^(\+58|0)\d{10}$/).optional(),
}).strict();

export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

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

export interface DashboardStats {
  totalActiveTenants: number;
  totalInactiveTenants: number;
  expiringSubscriptions: number;
  totalUsers: number;
}

export interface TenantAnalytics {
  monthlySalesCount: number;
  monthlySalesTotalBs: number;
  activeProducts: number;
  totalUsers: number;
}

export interface ResetPasswordInput {
  userId: string;
  newPassword: string;
}

export interface GlobalCategory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export const CreateGlobalCategorySchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
}).strict();

export type CreateGlobalCategoryInput = z.infer<typeof CreateGlobalCategorySchema>;
