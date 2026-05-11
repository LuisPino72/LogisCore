import { type FC } from 'react';
import { cn } from '../../lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
}

export const Textarea: FC<TextareaProps> = ({ 
  label, 
  error, 
  hint, 
  className, 
  ...props 
}) => {
  return (
    <div className={cn('input-wrapper', className)}>
      {label && <label className="input-label">{label}</label>}
      <textarea 
        className={cn(
          'textarea', 
          error && 'input-error'
        )} 
        {...props} 
      />
      {error && <span className="input-error-text">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
};
