import { forwardRef, type ChangeEvent, useState } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';
import { validateValue, type ValidationRule } from '../../lib/validation';

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  validation?: ValidationRule;
  onValidate?: (error: string | null) => void;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error: externalError,
  hint,
  className,
  validation,
  onValidate,
  onChange,
  value,
  ...props
}, ref) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const displayError = externalError || (touched ? internalError : null);

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (validation && touched) {
      const err = validateValue(e.target.value, validation);
      setInternalError(err);
      onValidate?.(err);
    }
    onChange?.(e);
  };

  const handleBlur = () => {
    setTouched(true);
    if (validation && typeof value === 'string') {
      const err = validateValue(value, validation);
      setInternalError(err);
      onValidate?.(err);
    }
  };

  const hasRequired = validation?.required || props.required;

  return (
    <div className={cn('input-wrapper', className)}>
      {label && (
        <label className={cn('input-label', hasRequired && 'after:content-["*"] after:text-danger after:ml-0.5')}>
          {label}
        </label>
      )}
      <div className="select-wrapper">
        <select
          ref={ref}
          className={cn(
            'select',
            displayError && 'input-error'
          )}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          {...props}
        />
        <div className="select-arrow">
          <ChevronDown size={16} />
        </div>
      </div>
      {displayError && <span className="input-error-text">{displayError}</span>}
      {!displayError && hint && <span className="input-hint">{hint}</span>}
    </div>
  );
});
Select.displayName = 'Select';
