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
    <label className={cn('flex items-center gap-3 cursor-pointer', className)}>
      <div className="relative">
        <input
          ref={ref}
          type="checkbox"
          className="sr-only peer"
          {...props}
        />
        <div className={cn(
          'rounded-full bg-gray-300 peer-checked:bg-primary transition-colors',
          size === 'sm' ? 'w-8 h-4' : 'w-10 h-5',
        )}>
          <div className={cn(
            'absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform',
            size === 'sm' ? 'w-3 h-3 peer-checked:translate-x-4' : 'w-4 h-4 peer-checked:translate-x-5',
          )} />
        </div>
      </div>
      {label && <span className="text-sm text-gray-700 select-none">{label}</span>}
    </label>
  );
});
Toggle.displayName = 'Toggle';
