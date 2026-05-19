import { forwardRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { validateValue, type ValidationRule } from '../../lib/validation';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  validation?: ValidationRule;
  onValidate?: (_error: string | null) => void;
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
  onValidate,
  minDate,
  maxDate,
  value,
  formatHint,
  ...props
}, ref) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const displayError = externalError || (touched ? internalError : null);

  const hasRequired = validation?.required || props.required;

  const handleBlur = () => {
    setTouched(true);
    if (validation && typeof value === 'string') {
      const err = validateValue(value, validation);
      setInternalError(err);
      onValidate?.(err);
    }
  };

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
          onBlur={handleBlur}
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
