import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface BottomNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  onClick: () => void;
}

interface BottomNavProps {
  items: BottomNavItem[];
  activeId: string;
  className?: string;
}

const NAV_ICON_CLASS = 'flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:!h-4 [&_svg]:!w-4';

export function BottomNav({ items, activeId, className }: BottomNavProps) {
  const [mounted, setMounted] = useState(false);
  const compact = items.length >= 5;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <nav
      className={cn(
        'sm:hidden fixed right-0 z-50 border-t border-gray-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)]',
        className,
      )}
      style={{
        left: 'var(--sidebar-actual, 0px)',
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label="Navegación del módulo"
    >
      <div className="flex h-14 items-center px-0.5">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0 rounded-lg px-0.5 py-1 transition-colors duration-200',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary"
                  aria-hidden
                />
              )}
              <span className={cn('relative flex items-center justify-center', NAV_ICON_CLASS)}>
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[12px] rounded-full bg-danger px-0.5 py-0.5 text-center text-[8px] leading-none font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'w-full truncate text-center leading-tight',
                  compact ? 'max-w-[52px] text-[9px]' : 'max-w-[64px] text-[10px]',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>,
    document.body,
  );
}
