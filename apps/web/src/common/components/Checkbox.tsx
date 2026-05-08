import { type FC, useId } from 'react';
import { cn } from '../../lib/utils';

interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export const Checkbox: FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled,
  error,
  className,
}) => {
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="checkbox-wrapper">
        <input
          id={id}
          type="checkbox"
          className="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
        />
        {label && <span className="checkbox-label">{label}</span>}
      </label>
      {error && <p className="input-error-text">{error}</p>}
    </div>
  );
};