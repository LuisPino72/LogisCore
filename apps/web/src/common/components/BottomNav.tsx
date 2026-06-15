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

const NAV_ICON_CLASS = 'flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:!h-4 [&_svg]:!w-4';

export function BottomNav({ items, activeId, className }: BottomNavProps) {
  const compact = items.length >= 5;

  return (
    <nav
      className={cn(
        'sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/80 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.08)] bottom-nav-mobile',
        className,
      )}
      style={{
        left: 'var(--sidebar-actual, 0px)',
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
                  className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary animate-fade-in"
                  aria-hidden
                />
              )}
              <span className={cn('relative flex items-center justify-center', NAV_ICON_CLASS)}>
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-4 rounded-full bg-danger px-1 py-0.5 text-center text-[10px] leading-none font-bold text-white animate-pulse">
                    {item.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'w-full truncate text-center leading-tight',
                  compact ? 'max-w-13 text-[9px]' : 'max-w-16 text-[10px]',
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
