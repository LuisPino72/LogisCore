import { type FC, type InputHTMLAttributes, useId } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export const Input: FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  id: externalId,
  className,
  type = 'text',
  ...props
}) => {
  const generatedId = useId();
  const id = externalId || generatedId;

  const inputMode = type === 'number' ? 'decimal' : type === 'tel' ? 'numeric' : undefined;
  const step = type === 'number' ? 'any' : undefined;

  return (
    <div className="input-wrapper">
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && <span className="input-icon-left">{leftIcon}</span>}
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          step={step}
          className={cn('input', leftIcon && 'input-with-icon', error && 'input-error', className)}
          {...props}
        />
      </div>
      {error ? (
        <p className="input-error-text">{error}</p>
      ) : hint ? (
        <p className="input-hint">{hint}</p>
      ) : null}
    </div>
  );
};