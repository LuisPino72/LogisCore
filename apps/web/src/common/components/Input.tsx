import { forwardRef, useState, useRef, useEffect, type ReactNode, type ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { validateValue, sanitizeValue, type ValidationRule } from '../../lib/validation';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: ReactNode;
  error?: string;
  hint?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOutside?: boolean;
  className?: string;
  inputClassName?: string;
  validation?: ValidationRule;
  onValidate?: (error: string | null) => void;
  sanitize?: 'number' | 'currency' | 'rif' | 'phone' | 'none';
  decimals?: number;
  allowNegative?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  showPassword?: boolean;
}

function valueToDisplay(v: unknown, getSanitized: (s: string) => string): string {
  if (typeof v === 'string') return getSanitized(v);
  if (v != null) return String(v);
  return '';
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
  showPassword = false,
  ...props
}, ref) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const isInternalRef = useRef(false);

  const getSanitized = (v: string) => sanitizeValue(v, sanitize, { decimals, allowNegative });

  const initDisplay = () => valueToDisplay(value, getSanitized);
  const [displayValue, setDisplayValue] = useState(initDisplay);

  useEffect(() => {
    if (isInternalRef.current) {
      isInternalRef.current = false;
      return;
    }
    const propStr = valueToDisplay(value, getSanitized);
    const currentSanitized = getSanitized(displayValue);
    if (propStr !== currentSanitized) {
      setDisplayValue(propStr);
      setInternalError(null);
    }
  }, [value, sanitize, decimals, allowNegative]);

  const displayError = externalError || (touched ? internalError : null);
  const isPassword = props.type === 'password';
  const effectiveType = showPassword && isPassword ? (visible ? 'text' : 'password') : props.type;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = sanitize !== 'none' ? getSanitized(raw) : raw;

    setDisplayValue(sanitized);
    isInternalRef.current = true;

    const sanitizedEvent = {
      ...e,
      target: { ...e.target, value: sanitized },
    } as ChangeEvent<HTMLInputElement>;

    if (validation && touched) {
      const err = validateValue(sanitized, validation);
      setInternalError(err);
      onValidate?.(err);
    }

    onChange?.(sanitizedEvent);
  };

  const handleBlur = () => {
    setTouched(true);
    if (sanitize === 'currency' || sanitize === 'number') {
      const num = parseFloat(displayValue);
      if (!isNaN(num)) {
        const formatted = num.toFixed(decimals);
        if (formatted !== displayValue) {
          isInternalRef.current = true;
          setDisplayValue(formatted);
        }
      }
    }
    if (validation && typeof value === 'string') {
      const err = validateValue(getSanitized(value), validation);
      setInternalError(err);
      onValidate?.(err);
    }
  };

  const hasRequired = validation?.required || props.required;

  const toggleVisibility = () => setVisible((v) => !v);

  const passwordIcon = showPassword && isPassword ? (
    <button
      type="button"
      onClick={toggleVisibility}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  ) : iconRight ? (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{iconRight}</div>
  ) : null;

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
            {...props}
            type={effectiveType}
            className={cn(
              'input',
              (iconLeft && !iconOutside) && 'pl-10',
              (iconRight || (showPassword && isPassword)) && 'pr-10',
              displayError && 'input-error',
              (effectiveType === 'date' || effectiveType === 'month') && 'cursor-pointer',
              inputClassName
            )}
            maxLength={validation?.maxLength}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onClick={(e) => {
              const input = e.currentTarget;
              if ((effectiveType === 'date' || effectiveType === 'month') && typeof input.showPicker === 'function') {
                input.showPicker();
              }
              props.onClick?.(e);
            }}
          />
          {passwordIcon}
        </div>
      </div>
      {displayError && <span className="input-error-text">{displayError}</span>}
      {!displayError && hint && <span className="input-hint">{hint}</span>}
      {validation?.maxLength && typeof value === 'string' && (
        <span className={cn(
          'text-xs text-right mt-0.5 block',
          getSanitized(value).length > validation.maxLength * 0.9 ? 'text-warning' : 'text-text-muted'
        )}>
          {getSanitized(value).length}/{validation.maxLength}
        </span>
      )}
    </div>
  );
});
Input.displayName = 'Input';
