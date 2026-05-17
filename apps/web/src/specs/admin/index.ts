import { z } from 'zod';

/** Admin Spec - ADMIN-001..008 (ADMIN-004 removed) */

export const CreateTenantSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  rif: z.string().regex(/^[VJEGP]\d{9}$/, 'RIF inválido'),
});

export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email('Email inválido').max(30),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(100)
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo'),
  name: z.string().min(1, 'Nombre requerido').max(100),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const CreateTenantWithUsersSchema = z.object({
  tenant: CreateTenantSchema,
  owner: CreateUserSchema,
  employees: z.array(CreateUserSchema).max(3).default([]),
});

export type CreateTenantWithUsers = z.infer<typeof CreateTenantWithUsersSchema>;

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rif: z.string().regex(/^[VJEGP]\d{9}$/).optional(),
});

export type UpdateTenant = z.infer<typeof UpdateTenantSchema>;

// ADMIN-005: Tenant filters
export const TenantFilterSchema = z.object({
  search: z.string().default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  plan: z.string().default('all'),
});

export type TenantFilter = z.infer<typeof TenantFilterSchema>;

// ADMIN-006: Restore tenant
export const RestoreTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export type RestoreTenant = z.infer<typeof RestoreTenantSchema>;

// ADMIN-007: Reset password
export const ResetPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(100)
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener un símbolo'),
});

export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

// ADMIN-008: Tenant analytics
export const TenantAnalyticsSchema = z.object({
  monthlySalesCount: z.number().min(0),
  activeProducts: z.number().min(0),
  totalUsers: z.number().min(0),
});

export type TenantAnalytics = z.infer<typeof TenantAnalyticsSchema>;
