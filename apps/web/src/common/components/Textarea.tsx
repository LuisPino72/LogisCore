import { type FC, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '../../lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: FC<TextareaProps> = ({
  label,
  error,
  id: externalId,
  className,
  rows = 3,
  ...props
}) => {
  const id = externalId || useId();

  return (
    <div className="input-wrapper">
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        className={cn('textarea', error && 'input-error', className)}
        {...props}
      />
      {error && <p className="input-error-text">{error}</p>}
    </div>
  );
};