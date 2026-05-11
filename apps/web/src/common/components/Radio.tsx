import { type FC } from 'react';
import { cn } from '../../lib/utils';

interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
}

export const Radio: FC<RadioProps> = ({ 
  label, 
  className, 
  ...props 
}) => {
  return (
    <label className={cn('radio-wrapper', className)}>
      <input 
        type="radio" 
        className="radio" 
        {...props} 
      />
      <span className="radio-label">{label}</span>
    </label>
  );
};
