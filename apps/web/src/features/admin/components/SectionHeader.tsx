import type { ReactNode } from 'react';

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ icon, title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={`flex items-center gap-3 mb-4 ${className ?? ''}`}>
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 admin-header-glow">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-title font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-text-secondary truncate">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
