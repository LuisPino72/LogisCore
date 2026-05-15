import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({
  label,
  error,
  hint,
  className,
  ...props
}, ref) => {
  return (
    <div className={cn('input-wrapper', className)}>
      {label && <label className="input-label">{label}</label>}
      <input
        ref={ref}
        type="date"
        className={cn('input', error && 'input-error')}
        {...props}
      />
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
});
DatePicker.displayName = 'DatePicker';
