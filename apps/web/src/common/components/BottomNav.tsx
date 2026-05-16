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
        'sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 pl-14',
        className,
      )}
    >
      <div className="flex items-stretch h-14">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative',
              activeId === item.id ? 'text-primary' : 'text-gray-400',
            )}
          >
            <span className="relative">
              {item.icon}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-danger text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[14px] text-center leading-none">
                  {item.badge}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium truncate max-w-[64px]">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
