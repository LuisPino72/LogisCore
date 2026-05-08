import { type FC } from 'react';
import { cn } from '../../lib/utils';

interface RadioOption {
  value: string;
  label: string;
}

interface RadioProps {
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  direction?: 'vertical' | 'horizontal';
  className?: string;
}

export const Radio: FC<RadioProps> = ({
  name,
  options,
  value,
  onChange,
  label,
  error,
  direction = 'vertical',
  className,
}) => {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <p className="input-label">{label}</p>}
      <div className={cn('radio-group', direction === 'horizontal' && 'radio-group-horizontal')}>
        {options.map((opt) => (
          <label key={opt.value} className="radio-wrapper">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange?.(opt.value)}
              className="radio"
            />
            <span className="radio-label">{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="input-error-text">{error}</p>}
    </div>
  );
};