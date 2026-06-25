import { type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock } from 'lucide-react';
import { EmptyState, Skeleton } from '../../../common/components';
import type { ActivityEntry } from '../types';

interface RecentActivityWidgetProps {
  activity: ActivityEntry[];
  loading: boolean;
}

const DOT_COLORS: Record<ActivityEntry['type'], string> = {
  sale_completed: 'bg-green-500',
  sale_voided: 'bg-red-500',
  expense_created: 'bg-orange-500',
  debt_collected: 'bg-blue-500',
  purchase_received: 'bg-purple-500',
  supplier_paid: 'bg-amber-500',
};

function getRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export const RecentActivityWidget: FC<RecentActivityWidgetProps> = ({ activity, loading }) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity size={16} className="text-primary" />
          </div>
          <h3 className="text-sm font-title font-bold text-gray-900">Actividad Reciente</h3>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton count={1} className="h-2! w-2! rounded-full!" />
              <div className="flex-1 space-y-1">
                <Skeleton count={1} className="h-3! w-3/4!" />
                <Skeleton count={1} className="h-2! w-1/4!" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!activity.length) {
    return (
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity size={16} className="text-primary" />
          </div>
          <h3 className="text-sm font-title font-bold text-gray-900">Actividad Reciente</h3>
        </div>
        <EmptyState
          icon={<Clock size={40} />}
          title="Aún no hay actividad reciente"
          description="Las ventas, gastos y movimientos aparecerán aquí."
        />
      </div>
    );
  }

  const visible = activity.slice(0, 10);

  return (
    <div>
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity size={16} className="text-primary" />
        </div>
        <h3 className="text-sm font-title font-bold text-gray-900">Actividad Reciente</h3>
      </div>
      <div className="space-y-0 relative pl-4 border-l-2 border-gray-200">
        {visible.map((entry, idx) => {
          const dotColor = DOT_COLORS[entry.type] ?? 'bg-gray-400';
          return (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2.5 min-h-[44px] rounded-lg px-2 -ml-4 transition-colors duration-150 hover:bg-gray-50 cursor-pointer animate-slide-up"
              style={{ animationDelay: `${idx * 0.03}s` }}
              role="button"
              tabIndex={0}
              onClick={() => { if (entry.route) { 
                const entityType = entry.type === 'sale_completed' ? 'sale_completed' : entry.type;
                navigate(entry.route, { state: { entityId: entry.entityId, entityType } }); 
              }}}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && entry.route) { e.preventDefault(); 
                const entityType = entry.type === 'sale_completed' ? 'sale_completed' : entry.type;
                navigate(entry.route, { state: { entityId: entry.entityId, entityType } }); } }}
            >
              <div className="flex flex-col items-center shrink-0 pt-1.5 ml-[-21px]">
                <div className={`w-2 h-2 rounded-full ${dotColor} ring-2 ring-white`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate leading-snug">{entry.message}</p>
                <span className="text-[11px] text-text-secondary">{getRelativeTime(entry.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
