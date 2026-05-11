import { type FC } from 'react';
import { cn } from '../../lib/utils';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
}

export const Checkbox: FC<CheckboxProps> = ({ 
  label, 
  className, 
  ...props 
}) => {
  return (
    <label className={cn('checkbox-wrapper', className)}>
      <input 
        type="checkbox" 
        className="checkbox" 
        {...props} 
      />
      <span className="checkbox-label">{label}</span>
    </label>
  );
};
