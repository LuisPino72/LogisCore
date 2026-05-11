import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
}

export const Input: FC<InputProps> = ({ 
  label, 
  error, 
  hint, 
  iconLeft, 
  iconRight, 
  className, 
  ...props 
}) => {
  return (
    <div className={cn('input-wrapper', className)}>
      {label && <label className="input-label">{label}</label>}
      <div className="relative">
        {iconLeft && <div className="input-icon-left">{iconLeft}</div>}
        <input 
          className={cn(
            'input', 
            iconLeft && 'pl-10',
            error && 'input-error'
          )} 
          {...props} 
        />
        {iconRight && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{iconRight}</div>}
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
};
