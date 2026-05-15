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
  return (
    <label className={cn('flex items-center gap-3 cursor-pointer select-none min-h-[44px]', className)}>
      <div className="relative flex items-center">
        <input
          ref={ref}
          type="checkbox"
          className="sr-only peer"
          {...props}
        />
        <div className={cn(
          'rounded-full bg-gray-300 peer-checked:bg-primary transition-colors',
          size === 'sm' ? 'w-9 h-5' : 'w-11 h-6',
        )}>
          <div className={cn(
            'absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform',
            size === 'sm' ? 'w-4 h-4 peer-checked:translate-x-4' : 'w-5 h-5 peer-checked:translate-x-5',
          )} />
        </div>
      </div>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
});
Toggle.displayName = 'Toggle';
