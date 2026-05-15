import { forwardRef, useState, type ChangeEvent, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { validateValue, type ValidationRule } from '../../lib/validation';

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  validation?: ValidationRule;
  onValidate?: (error: string | null) => void;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  autoResize?: boolean;
  maxRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error: externalError,
  hint,
  className,
  validation,
  onValidate,
  onChange,
  autoResize = false,
  maxRows = 6,
  value,
  ...props
}, ref) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const displayError = externalError || (touched ? internalError : null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (validation && touched) {
      const err = validateValue(e.target.value, validation);
      setInternalError(err);
      onValidate?.(err);
    }
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight);
      const maxHeight = lineHeight * maxRows;
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxHeight) + 'px';
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

  useEffect(() => {
    if (autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight);
      const maxHeight = lineHeight * maxRows;
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxHeight) + 'px';
    }
  }, [value, autoResize, maxRows]);

  const setRefs = (node: HTMLTextAreaElement | null) => {
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    textareaRef.current = node;
  };

  const hasRequired = validation?.required || props.required;

  return (
    <div className={cn('input-wrapper', className)}>
      {label && (
        <label className={cn('input-label', hasRequired && 'after:content-["*"] after:text-danger after:ml-0.5')}>
          {label}
        </label>
      )}
      <textarea
        ref={setRefs}
        className={cn(
          'textarea',
          displayError && 'input-error'
        )}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
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
Textarea.displayName = 'Textarea';
