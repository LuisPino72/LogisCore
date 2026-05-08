import { type FC, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const Select: FC<SelectProps> = ({
  label,
  error,
  hint,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  className,
}) => {
  const id = useId();

  return (
    <div className="input-wrapper">
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
        </label>
      )}
      <div className="select-wrapper">
        <select
          id={id}
          className={cn('select', error && 'input-error', className)}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.length === 0 && (
            <option value="" disabled>
              Sin opciones disponibles
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="select-arrow" size={16} />
      </div>
      {error ? <p className="input-error-text">{error}</p> : hint ? <p className="input-hint">{hint}</p> : null}
    </div>
  );
};