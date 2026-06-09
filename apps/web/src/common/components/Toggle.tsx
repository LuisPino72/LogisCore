import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  size?: 'sm' | 'md';
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(({
  label,
  size = 'md',
  className,
  ...props
}, ref) => {
  const isSmall = size === 'sm';
  return (
    <label className={cn('inline-flex items-center gap-3 cursor-pointer select-none min-h-11', className)}>
      <div className="relative" style={{ width: isSmall ? 36 : 44, height: isSmall ? 20 : 24 }}>
        <input
          ref={ref}
          type="checkbox"
          className="sr-only peer"
          {...props}
        />
        <div className={cn(
          'absolute inset-0 rounded-full bg-border peer-checked:bg-primary transition-colors',
        )} />
        <div className={cn(
          'absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform',
          isSmall ? 'w-4 h-4 peer-checked:translate-x-4' : 'w-5 h-5 peer-checked:translate-x-5',
        )} />
      </div>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  );
});
Toggle.displayName = 'Toggle';
