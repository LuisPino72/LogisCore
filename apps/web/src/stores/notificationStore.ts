import { create } from 'zustand';
import { notificationService } from '../services/notifications/notificationService';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionPayload?: unknown;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  loaded: boolean;
  tenantId: string | null;
  setTenantId: (id: string) => void;
  loadNotifications: (tenantId: string) => Promise<void>;
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loaded: false,
  tenantId: null,

  setTenantId: (id) => set({ tenantId: id }),

  loadNotifications: async (tenantId) => {
    await notificationService.dedupeAll(tenantId);
    const result = await notificationService.loadNotifications(tenantId);
    if (result.ok) {
      const seen = new Set<string>();
      const deduped = result.data.filter((n) => {
        const fp = `${n.type}|${n.title}|${n.message}`;
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      });
      set({ notifications: deduped, loaded: true, tenantId });
    }
  },

  addNotification: async (n) => {
    const { tenantId } = get();
    if (!tenantId) return;
    const result = await notificationService.addNotification({ ...n, tenantId });
    if (result.ok) {
      set((s) => {
        const exists = s.notifications.some((existing) => existing.id === result.data.id);
        if (exists) return s;
        return { notifications: [result.data, ...s.notifications] };
      });
    }
  },

  markAsRead: async (id) => {
    await notificationService.markAsRead(id);
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },

  dismissNotification: async (id) => {
    await notificationService.dismissNotification(id);
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: async () => {
    const { tenantId } = get();
    if (tenantId) await notificationService.clearAll(tenantId);
    set({ notifications: [] });
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
