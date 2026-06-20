export const RoleErrors = {
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NAME_EXISTS: 'ROLE_NAME_EXISTS',
  ROLE_IS_SYSTEM: 'ROLE_IS_SYSTEM',
  ROLE_PERMISSION_DUPLICATE: 'ROLE_PERMISSION_DUPLICATE',
  ROLE_HAS_USERS: 'ROLE_HAS_USERS',
  ROLE_PERMISSION_INVALID: 'ROLE_PERMISSION_INVALID',
  ROLE_OVERRIDE_INVALID: 'ROLE_OVERRIDE_INVALID',
} as const;

export type RoleErrorCode = (typeof RoleErrors)[keyof typeof RoleErrors];

export const ROLE_ERROR_MESSAGES: Record<RoleErrorCode, string> = {
  [RoleErrors.ROLE_NOT_FOUND]: 'Rol no encontrado.',
  [RoleErrors.ROLE_NAME_EXISTS]: 'Ya existe un rol con este nombre.',
  [RoleErrors.ROLE_IS_SYSTEM]: 'No se puede modificar un rol del sistema.',
  [RoleErrors.ROLE_PERMISSION_DUPLICATE]: 'Este permiso ya está asignado al rol.',
  [RoleErrors.ROLE_HAS_USERS]: 'No se puede eliminar un rol que tiene usuarios asignados.',
  [RoleErrors.ROLE_PERMISSION_INVALID]: 'Formato de permiso inválido. Use module:action.',
  [RoleErrors.ROLE_OVERRIDE_INVALID]: 'Formato de override inválido.',
};
