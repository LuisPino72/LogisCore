import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOutside?: boolean;
  className?: string;
  inputClassName?: string;
}

export const Input: FC<InputProps> = ({ 
  label, 
  error, 
  hint, 
  iconLeft, 
  iconRight, 
  iconOutside = false,
  className, 
  inputClassName,
  ...props 
}) => {
  return (
    <div className={cn('input-wrapper', className)}>
      {label && <label className="input-label">{label}</label>}
      <div className={cn('relative', iconOutside && 'flex items-center gap-3')}>
        {iconLeft && (
          <div className={cn(
            !iconOutside && 'input-icon-left',
            iconOutside && 'text-gray-400 flex-shrink-0'
          )}>
            {iconLeft}
          </div>
        )}
        <div className="relative flex-1">
          <input 
            className={cn(
              'input', 
              (iconLeft && !iconOutside) && 'pl-10',
              iconRight && 'pr-10',
              error && 'input-error',
              inputClassName
            )} 
            {...props} 
          />
          {iconRight && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{iconRight}</div>}
        </div>
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
};
