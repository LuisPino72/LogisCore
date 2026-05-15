import { create } from 'zustand';
import type { Permission } from '@logiscore/core';

interface PermissionState {
  permissions: Permission[];
  setPermissions: (perms: Permission[]) => void;
  hasPermission: (permission: Permission) => boolean;
  clear: () => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],

  setPermissions: (perms) => set({ permissions: perms }),
  hasPermission: (permission) => get().permissions.includes(permission),
  clear: () => set({ permissions: [] }),
}));
