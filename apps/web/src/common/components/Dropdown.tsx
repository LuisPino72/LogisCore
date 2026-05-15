import { useState, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useClickOutside } from '../hooks/useClickOutside';

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          role="menu"
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={item.disabled}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                item.variant === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100',
                item.disabled && 'opacity-50 cursor-not-allowed',
              )}
              role="menuitem"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
