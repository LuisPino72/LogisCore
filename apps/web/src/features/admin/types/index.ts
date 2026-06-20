import { z } from 'zod';

export const CreateTenantInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(25),
  rif: z.string().regex(/^[VJEGP]\d{9}$/, 'RIF inválido formato J123456789'),
  direccion: z.string().max(25).optional().default(''),
  telefono: z.string().regex(/^(\+58|0)\d{10}$/, 'Teléfono inválido').optional().default(''),
}).strict();

export type CreateTenantInput = z.infer<typeof CreateTenantInputSchema>;

export const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .max(14)
  .regex(/[A-Z]/, 'Debe contener una mayúscula')
  .regex(/[a-z]/, 'Debe contener una minúscula')
  .regex(/[0-9]/, 'Debe contener un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo');

export const CreateOwnerInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido').max(25),
  tenantId: z.string().uuid('ID de tenant inválido'),
}).strict();

export type CreateOwnerInput = z.infer<typeof CreateOwnerInputSchema>;

export const CreateEmployeeInputSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido').max(25),
  tenantId: z.string().uuid('ID de tenant inválido'),
  roleId: z.string().uuid('ID de rol inválido').optional(),
}).strict();

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInputSchema>;

export const EdgeCreateUserSchema = z.object({
  email: z.string().email('Email inválido').max(30, 'Email máximo 30 caracteres'),
  password: passwordSchema,
  name: z.string().min(1, 'Nombre requerido').max(25),
}).strict();

export type EdgeCreateUser = z.infer<typeof EdgeCreateUserSchema>;

export const CreateTenantWithUsersInputSchema = z.object({
  tenant: CreateTenantInputSchema,
  owner: EdgeCreateUserSchema,
  employees: z.array(EdgeCreateUserSchema).max(3).default([]),
}).strict();

export type CreateTenantWithUsersInput = z.infer<typeof CreateTenantWithUsersInputSchema>;

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(25).optional(),
  rif: z.string().regex(/^[VJEGP]\d{9}$/).optional(),
  direccion: z.string().max(25).optional(),
  telefono: z.string().regex(/^(\+58|0)\d{10}$/).optional(),
}).strict();

export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export type TenantPlan = 'basico' | 'plus' | 'premium';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  rif: string;
  direccion?: string;
  telefono?: string;
  logoUrl?: string;
  plan: TenantPlan;
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

// Migrado desde specs/admin/index.ts
export const RestoreTenantSchema = z.object({
  tenantId: z.string().uuid(),
});
export type RestoreTenant = z.infer<typeof RestoreTenantSchema>;

export const ResetPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: passwordSchema,
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export const TenantFilterSchema = z.object({
  search: z.string().default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  plan: z.string().default('all'),
});
export type TenantFilter = z.infer<typeof TenantFilterSchema>;

export const TenantAnalyticsSchema = z.object({
  monthlySalesCount: z.number().min(0),
  activeProducts: z.number().min(0),
  totalUsers: z.number().min(0),
});
export type TenantAnalyticsSchemaType = z.infer<typeof TenantAnalyticsSchema>;
