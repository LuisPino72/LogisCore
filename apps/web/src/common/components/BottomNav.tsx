import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
}

interface BottomNavProps {
  items: NavItem[];
  activeKey: string;
  className?: string;
}

export const BottomNav: FC<BottomNavProps> = ({ items, activeKey, className }) => {
  return (
    <nav className={cn('bottom-nav', className)}>
      <div className="bottom-nav-inner">
        {items.map((item) => (
          <button
            key={item.key}
            className={cn(
              'bottom-nav-item',
              activeKey === item.key && 'bottom-nav-active',
            )}
            onClick={item.onClick}
          >
            <div className="relative">
              <div className="bottom-nav-icon">{item.icon}</div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="bottom-nav-badge">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
