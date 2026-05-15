import { forwardRef, useState, type ReactNode, type ChangeEvent } from 'react';
import { cn } from '../../lib/utils';
import { validateValue, sanitizeNumber, type ValidationRule } from '../../lib/validation';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOutside?: boolean;
  className?: string;
  inputClassName?: string;
  validation?: ValidationRule;
  onValidate?: (error: string | null) => void;
  sanitize?: 'number' | 'currency' | 'rif' | 'none';
  decimals?: number;
  allowNegative?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error: externalError,
  hint,
  iconLeft,
  iconRight,
  iconOutside = false,
  className,
  inputClassName,
  validation,
  onValidate,
  sanitize = 'none',
  decimals = 2,
  allowNegative = false,
  onChange,
  value,
  ...props
}, ref) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const displayError = externalError || (touched ? internalError : null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;

    if (sanitize === 'number' || sanitize === 'currency') {
      rawValue = sanitizeNumber(rawValue, { decimals: sanitize === 'currency' ? decimals : decimals, allowNegative });
    } else if (sanitize === 'rif') {
      rawValue = rawValue.toUpperCase().replace(/[^VJEGP0-9]/g, '');
      if (rawValue.length > 1 && !/[VJEGP]/.test(rawValue[0])) {
        rawValue = rawValue.slice(1);
      }
    }

    if (validation && touched) {
      const err = validateValue(rawValue, validation);
      setInternalError(err);
      onValidate?.(err);
    }

    const syntheticEvent = { ...e, target: { ...e.target, value: rawValue } } as ChangeEvent<HTMLInputElement>;
    onChange?.(syntheticEvent);
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
      <div className={cn('relative', iconOutside && 'flex items-center gap-3')}>
        {iconLeft && (
          <div className={cn(
            !iconOutside && 'input-icon-left',
            iconOutside && 'text-gray-400 shrink-0'
          )}>
            {iconLeft}
          </div>
        )}
        <div className="relative flex-1">
          <input
            ref={ref}
            className={cn(
              'input',
              (iconLeft && !iconOutside) && 'pl-10',
              iconRight && 'pr-10',
              displayError && 'input-error',
              inputClassName
            )}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            {...props}
          />
          {iconRight && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{iconRight}</div>}
        </div>
      </div>
      {displayError && <span className="input-error-text">{displayError}</span>}
      {!displayError && hint && <span className="input-hint">{hint}</span>}
      {validation?.maxLength && typeof value === 'string' && (
        <span className={cn(
          'text-xs text-right mt-0.5 block',
          value.length > validation.maxLength * 0.9 ? 'text-warning' : 'text-text-muted'
        )}>
          {value.length}/{validation.maxLength}
        </span>
      )}
    </div>
  );
});
Input.displayName = 'Input';
