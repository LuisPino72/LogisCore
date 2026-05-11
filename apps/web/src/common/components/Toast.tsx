import { type FC, useState } from 'react';
import { X } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useToastStore();
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  if (toasts.length === 0) return null;

  const handleRemove = (id: string) => {
    setLeavingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeToast(id);
      setLeavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type} relative overflow-hidden ${leavingIds.has(toast.id) ? 'opacity-0 translate-x-4' : ''}`}
          style={{ transition: 'opacity 0.2s, transform 0.2s' }}
        >
          <p className="toast-message">{toast.message}</p>
          <button className="toast-close" onClick={() => handleRemove(toast.id)}>
            <X size={16} />
          </button>
          {toast.duration && toast.duration > 0 && (
            <div
              className="toast-progress"
              style={{ animationDuration: `${toast.duration}ms` }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
