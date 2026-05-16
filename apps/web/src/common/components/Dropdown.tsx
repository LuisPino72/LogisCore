import { useState, useRef, type ReactNode, useCallback, useEffect } from 'react';
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeAndReset();
      return;
    }

    const enabledItems = items.map((item, i) => ({ ...item, index: i })).filter(item => !item.disabled);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = prev < 0 ? enabledItems[0]?.index : enabledItems[(enabledItems.findIndex(i => i.index === prev) + 1) % enabledItems.length]?.index;
        return next ?? -1;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const currentPos = enabledItems.findIndex(i => i.index === prev);
        const pos = currentPos <= 0 ? enabledItems.length - 1 : currentPos - 1;
        return enabledItems[pos]?.index ?? -1;
      });
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      items[focusedIndex]?.onClick();
      closeAndReset();
    }
  }, [open, focusedIndex, items, closeAndReset]);

  useEffect(() => {
    if (open && menuRef.current) {
      const firstEnabled = items.findIndex(item => !item.disabled);
      if (firstEnabled >= 0) setFocusedIndex(firstEnabled);
    }
  }, [open, items]);

  return (
    <div ref={ref} className={cn('relative inline-block', className)} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center min-h-[44px] min-w-[44px]"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Abrir menú"
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={menuRef}
          className={cn(
            'absolute z-40 mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          role="menu"
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); closeAndReset(); }}
              disabled={item.disabled}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                item.variant === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100',
                item.disabled && 'opacity-50 cursor-not-allowed',
                focusedIndex === i && 'bg-gray-100',
              )}
              role="menuitem"
              tabIndex={item.disabled ? -1 : 0}
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
