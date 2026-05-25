import { useState, useRef, useEffect } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, dismissNotification } = useNotificationStore();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const count = unreadCount();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={18} className="text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-danger rounded-full">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => { useNotificationStore.getState().clearAll(); setOpen(false); }}
                className="text-xs text-text-secondary hover:text-gray-900"
              >
                Limpiar todo
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No hay notificaciones
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                      {n.actionLabel && (
                        <button
                          onClick={() => {
                            if (n.actionPayload) {
                              console.log('Action:', n.actionPayload);
                            }
                            dismissNotification(n.id);
                          }}
                          className="mt-1.5 text-xs font-medium text-primary hover:text-primary/80"
                        >
                          {n.actionLabel}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => n.read ? dismissNotification(n.id) : markAsRead(n.id)}
                      className="shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                      title={n.read ? 'Eliminar' : 'Marcar como leído'}
                    >
                      {n.read ? <X size={12} /> : <Check size={12} />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
