import { type ReactNode } from 'react';
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

export function BottomNav({ items, activeId, className }: BottomNavProps) {
  return (
    <nav
      className={cn(
        'sm:hidden fixed bottom-0 right-0 z-30 border-t border-gray-200 bg-white',
        className,
      )}
      style={{ left: 'var(--sidebar-actual, 0px)' }}
      aria-label="Navegación del módulo"
    >
      <div className="flex h-14 items-stretch px-1">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative mx-0.5 my-1 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative flex items-center justify-center transition-transform duration-200',
                  isActive && 'scale-110',
                )}
              >
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] rounded-full bg-danger px-1 py-0.5 text-center text-[9px] leading-none font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'max-w-[64px] truncate text-[10px]',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
