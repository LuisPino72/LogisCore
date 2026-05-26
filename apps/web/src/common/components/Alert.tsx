import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  onClose?: () => void;
}

export const Alert: FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  className,
  icon,
  onClose,
}) => {
  return (
    <div className={cn('alert alert-animate', 'alert-' + variant, className)} role="alert">
      {icon && <div className="mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
      {onClose && (
        <button className="toast-close shrink-0" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      )}
    </div>
  );
};
