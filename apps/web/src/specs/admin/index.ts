import { z } from 'zod';

/** Admin Spec - ADMIN-001..003 */

export const CreateTenantSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  rif: z.string().regex(/^[VJEGP]\d{9}$/, 'RIF inválido'),
});

export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email('Email inválido').max(30),
  password: z.string().min(6, 'Debe tener al menos 6 caracteres').max(20),
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
