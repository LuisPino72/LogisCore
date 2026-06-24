import { z } from 'zod';

/** Formato module:action */
export const PermissionSchema = z.string().regex(
  /^[a-z_]+:[a-z_]+$/,
  'Formato inválido. Use module:action (ej: inventory:create)',
);

export const RLSTierSchema = z.enum(['admin', 'owner', 'employee']);

export const RoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  description: z.string().max(200).nullable().optional(),
  isSystem: z.boolean(),
  rlsTier: RLSTierSchema,
  createdAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

export type Role = z.infer<typeof RoleSchema>;

export const CreateRoleInputSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(50, 'Máximo 50 caracteres'),
  description: z.string().max(200, 'Máximo 200 caracteres').optional(),
  rlsTier: RLSTierSchema.default('employee'),
  permissions: z.array(PermissionSchema).default([]),
}).strict();

export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;

export const UpdateRoleInputSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional(),
  rlsTier: RLSTierSchema.optional(),
}).strict();

export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>;

export const RolePermissionSchema = z.object({
  id: z.string().uuid(),
  roleId: z.string().uuid(),
  permission: PermissionSchema,
  createdAt: z.string(),
});

export type RolePermission = z.infer<typeof RolePermissionSchema>;

export const UpsertPermissionsInputSchema = z.object({
  roleId: z.string().uuid(),
  permissions: z.array(PermissionSchema),
}).strict();

export type UpsertPermissionsInput = z.infer<typeof UpsertPermissionsInputSchema>;

export const OverrideEffectSchema = z.enum(['allow', 'deny']);

export const UserPermissionOverrideSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  permission: PermissionSchema,
  effect: OverrideEffectSchema,
  createdAt: z.string(),
});

export type UserPermissionOverride = z.infer<typeof UserPermissionOverrideSchema>;

export const CreateOverrideInputSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  permission: PermissionSchema,
  effect: OverrideEffectSchema,
}).strict();

export type CreateOverrideInput = z.infer<typeof CreateOverrideInputSchema>;

/** All known modules */
export const ALL_MODULES = [
  'dashboard',
  'inventory',
  'production',
  'purchases',
  'pos',
  'gastos',
  'customers',
  'reports',
  'exchange',
  'settings',
] as const;

export type ModuleName = (typeof ALL_MODULES)[number];

/** Default CRUD actions for a module */
export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

/** Special actions per module */
export const SPECIAL_ACTIONS: Record<string, string[]> = {
  dashboard: ['read'],
  inventory: ['adjust_stock', 'import_csv', 'manage_categories'],
  production: ['produce_batch'],
  purchases: ['receive_order', 'pay_debt'],
  pos: ['void_sale', 'close_box', 'open_box', 'apply_discount', 'manager_close', 'manage_registers'],
  customers: ['collect_debt'],
  reports: ['read', 'export', 'view_financials'],
  exchange: ['update'],
  settings: ['manage'],
};

/** Get all possible permissions for a module */
export function getModulePermissions(module: string): string[] {
  const crud = module === 'reports' || module === 'dashboard' || module === 'exchange' || module === 'settings'
    ? []
    : CRUD_ACTIONS.map((a) => `${module}:${a}`);
  const special = (SPECIAL_ACTIONS[module] ?? []).map((a) => `${module}:${a}`);
  return [...crud, ...special];
}

/** Get all known permissions across all modules */
export function getAllKnownPermissions(): string[] {
  return ALL_MODULES.flatMap(getModulePermissions);
}
