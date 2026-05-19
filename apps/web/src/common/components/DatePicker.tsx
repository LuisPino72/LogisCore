import { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { type ValidationRule } from '../../lib/validation';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  validation?: ValidationRule;
  _onValidate?: (_error: string | null) => void;
  minDate?: string;
  maxDate?: string;
  formatHint?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({
  label,
  error: externalError,
  hint,
  className,
  validation,
  _onValidate,
  minDate,
  maxDate,
  value,
  formatHint,
  ...props
}, ref) => {
  const displayError = externalError;

  const hasRequired = validation?.required || props.required;

  return (
    <div className={cn('input-wrapper', className)}>
      {label && (
        <label className={cn('input-label', hasRequired && 'after:content-["*"] after:text-danger after:ml-0.5')}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type="date"
          className={cn('input pr-16', displayError && 'input-error', formatHint && !value && 'text-transparent')}
          style={formatHint && !value ? { colorScheme: 'normal' } : undefined}
          min={minDate}
          max={maxDate}
          value={value}
          {...props}
        />
        {formatHint && !value && (
          <span className="absolute inset-0 flex items-center px-3 text-xs text-text-secondary pointer-events-none">
            {formatHint}
          </span>
        )}
      </div>
      {displayError && <span className="input-error-text">{displayError}</span>}
      {!displayError && hint && <span className="input-hint">{hint}</span>}
    </div>
  );
});
DatePicker.displayName = 'DatePicker';
