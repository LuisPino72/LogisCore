import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Badge } from './Badge';

export interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex overflow-x-auto gap-1 border-b border-gray-200', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
            activeKey === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && (
            <Badge variant={activeKey === tab.key ? 'info' : 'neutral'}>
              {tab.badge}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
