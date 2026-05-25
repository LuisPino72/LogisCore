import { create } from 'zustand';

export interface AppNotification {
  id: string;
  type: 'recurring_expense_reminder' | string;
  title: string;
  message: string;
  actionLabel?: string;
  actionPayload?: unknown;
  createdAt: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  addNotification: (n) => {
    const id = crypto.randomUUID();
    set((s) => ({
      notifications: [
        { ...n, id, createdAt: new Date().toISOString(), read: false },
        ...s.notifications,
      ],
    }));
  },
  markAsRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },
  dismissNotification: (id) => {
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  },
  clearAll: () => set({ notifications: [] }),
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
