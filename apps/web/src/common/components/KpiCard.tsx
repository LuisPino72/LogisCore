import { Card } from './Card';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  gradient: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  trend?: { value: number; positive: boolean };
  onClick?: () => void;
  className?: string;
  animationDelay?: number;
}

const gradients = {
  blue: 'from-primary/5 to-primary/[0.02] border-primary/20',
  green: 'from-success/5 to-success/[0.02] border-success/20',
  amber: 'from-accent/5 to-accent/[0.02] border-accent/20',
  red: 'from-danger/5 to-danger/[0.02] border-danger/20',
  purple: 'from-purple-500/5 to-purple-500/[0.02] border-purple-500/20',
};

const iconBgs = {
  blue: 'bg-primary/15 text-primary',
  green: 'bg-success/15 text-success',
  amber: 'bg-accent/15 text-accent',
  red: 'bg-danger/15 text-danger',
  purple: 'bg-purple-500/15 text-purple-500',
};

export function KpiCard({
  label,
  value,
  subtitle,
  icon,
  gradient,
  trend,
  onClick,
  className = '',
  animationDelay,
}: KpiCardProps) {
  return (
    <Card
      className={`relative p-3 sm:p-4 border bg-linear-to-br ${gradients[gradient]} transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]' : 'hover:shadow-md'
      } animate-report-stagger ${className}`}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}s` } : undefined}
      interactive={!!onClick}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className={`absolute top-1.5 right-1.5 sm:top-2 sm:right-2 p-1 sm:p-1.5 rounded-lg ${iconBgs[gradient]}`}>
        {icon}
      </div>
      <div className="space-y-1 pr-8 sm:pr-10">
        <p className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide">{label}</p>
        <div className="truncate">{value}</div>
        {subtitle && <div className="text-xs sm:text-sm text-gray-700 truncate">{subtitle}</div>}
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
            {trend.positive ? '↑' : '↓'}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      {onClick && (
        <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 text-gray-600/40">
          ›
        </div>
      )}
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="relative p-4 border bg-linear-to-br from-gray-50 to-gray-100/50">
      <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-200">
        <div className="skeleton h-4 w-4 rounded" />
      </div>
      <div className="space-y-2 pr-10">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-6 w-28 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    </Card>
  );
}
