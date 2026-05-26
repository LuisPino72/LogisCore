import { type FC, useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '../../stores/toastStore';

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ToastItem: FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [leaving, setLeaving] = useState(false);
  const Icon = ICON_MAP[toast.type] ?? Info;

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setLeaving(true);
        setTimeout(() => onRemove(toast.id), 200);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.id, onRemove]);

  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  return (
    <div
      className={`toast toast-${toast.type} relative overflow-hidden ${leaving ? 'opacity-0 translate-x-4' : ''}`}
      style={{ transition: 'opacity 0.2s, transform 0.2s' }}
    >
      <Icon size={18} className="shrink-0 mt-0.5" />
      <p className="toast-message">{toast.message}</p>
      <button className="toast-close" onClick={handleClose} aria-label="Cerrar notificación">
        <X size={16} />
      </button>
      {toast.duration && toast.duration > 0 && (
        <div className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
      )}
    </div>
  );
};

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};
