import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  className?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ 
  label, 
  className, 
  ...props 
}, ref) => {
  return (
    <label className={cn('checkbox-wrapper', className)}>
      <input 
        ref={ref}
        type="checkbox" 
        className="checkbox" 
        {...props} 
      />
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
