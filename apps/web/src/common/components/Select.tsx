import { type FC } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
}

export const Select: FC<SelectProps> = ({ 
  label, 
  error, 
  hint, 
  className, 
  ...props 
}) => {
  return (
    <div className={cn('input-wrapper', className)}>
      {label && <label className="input-label">{label}</label>}
      <div className="select-wrapper">
        <select 
          className={cn(
            'select', 
            error && 'input-error'
          )} 
          {...props} 
        />
        <div className="select-arrow">
          <ChevronDown size={16} />
        </div>
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
};
