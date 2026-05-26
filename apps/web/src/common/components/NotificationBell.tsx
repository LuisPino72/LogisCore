import { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, AlertTriangle } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { Modal } from './Modal';
import { Button } from './Button';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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
 
  const isCritical = (n: any) => {
    const criticalWords = ['stock', 'error', 'vencido', 'peligro', 'urgente', 'fallo'];
    const text = `${n.title} ${n.message}`.toLowerCase();
    return criticalWords.some(word => text.includes(word));
  };
 
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-all active:scale-95"
        aria-label="Notificaciones"
      >
        <Bell size={18} className="text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-danger rounded-full animate-pulse">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
 
      {open && (
        <div className="absolute right-0 top-full mt-1 sm:w-96 max-sm:min-w-[280px] max-sm:w-[calc(100vw-1rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[70vh] flex flex-col animate-slide-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
            {notifications.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="text-xs text-danger hover:text-danger-dark font-medium transition-colors"
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
                  className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-all active:scale-[0.99] cursor-pointer ${n.read ? 'opacity-60' : ''} ${isCritical(n) ? 'border-l-4 border-l-danger' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${isCritical(n) ? 'text-danger' : 'text-gray-900'} truncate`}>{n.title}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                      {n.actionLabel && (
                        <button
                            onClick={() => {
                            dismissNotification(n.id);
                          }}
                          className="mt-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {n.actionLabel}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => n.read ? dismissNotification(n.id) : markAsRead(n.id)}
                      className="shrink-0 p-1 rounded hover:bg-gray-200 transition-colors active:scale-90"
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

      <Modal isOpen={confirmClear} onClose={() => setConfirmClear(false)} title="Limpiar notificaciones" size="sm">
        <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
            <AlertTriangle size={24} className="text-danger" />
          </div>
          <p className="text-sm text-gray-600 text-center">
            ¿Seguro que quieres borrar todas las notificaciones?
          </p>
          <div className="flex gap-3 w-full pt-1">
            <Button variant="ghost" fullWidth onClick={() => setConfirmClear(false)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={() => { useNotificationStore.getState().clearAll(); setConfirmClear(false); setOpen(false); }}>
              Limpiar todo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
