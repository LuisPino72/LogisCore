import { create } from 'zustand';
import type { Permission } from '@logiscore/core';

interface PermissionState {
  permissions: Set<Permission>;
  setPermissions: (perms: Permission[]) => void;
  hasPermission: (permission: Permission) => boolean;
  clear: () => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: new Set(),

  setPermissions: (perms) => set({ permissions: new Set(perms) }),
  hasPermission: (permission) => get().permissions.has(permission),
  clear: () => set({ permissions: new Set() }),
}));
