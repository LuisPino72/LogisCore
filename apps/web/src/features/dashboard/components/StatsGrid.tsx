import { FC } from 'react';
import { Users, Star, Calendar, Activity } from 'lucide-react';
import { Badge } from '../../../common/components';

interface StatsGridProps {
  employees: number;
  plan: string | null;
  status: string | null;
  expiresAt: string | null;
  loading: boolean;
}

const statusLabels: Record<string, { label: string; variant: string }> = {
  active: { label: 'Activo', variant: 'badge-success' },
  expired: { label: 'Vencido', variant: 'badge-danger' },
  cancelled: { label: 'Cancelado', variant: 'badge-warning' },
};

const planLabels: Record<string, string> = {
  basic: 'Básico',
  pro: 'Profesional',
};

export const StatsGrid: FC<StatsGridProps> = ({ employees, plan, status, expiresAt, loading }) => {
  const statusInfo = status ? statusLabels[status] ?? { label: status, variant: 'badge-neutral' } : null;

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="skeleton h-8 w-8 rounded-lg mb-2" />
            <div className="skeleton-text w-16 mb-1" />
            <div className="skeleton-text w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid-2 md:grid-cols-4 gap-3">
      <div className="card p-4">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
          <Users size={18} className="text-primary" />
        </div>
        <p className="text-2xl font-title font-bold text-gray-900">{employees}</p>
        <p className="text-xs text-text-secondary mt-0.5">Empleados</p>
      </div>

      <div className="card p-4">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-2">
          <Star size={18} className="text-accent" />
        </div>
        <p className="text-2xl font-title font-bold text-gray-900">
          {plan ? (planLabels[plan] ?? plan) : '-'}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">Plan actual</p>
      </div>

      <div className="card p-4">
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mb-2">
          <Activity size={18} className="text-success" />
        </div>
        {statusInfo ? (
          <span className={`badge ${statusInfo.variant} text-sm px-2 py-0.5`}>
            {statusInfo.label}
          </span>
        ) : (
          <p className="text-2xl font-title font-bold text-gray-900">-</p>
        )}
        <p className="text-xs text-text-secondary mt-0.5">Estado</p>
      </div>

      <div className="card p-4">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
          <Calendar size={18} className="text-purple-700" />
        </div>
        {(() => {
          if (!expiresAt) return <p className="text-sm font-semibold text-gray-900">-</p>;

          const daysRemaining = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);

          if (daysRemaining <= 0) {
            return (
              <div className="space-y-1">
                <p className="text-xs font-bold text-danger">VENCIDA</p>
                <Badge variant={status === 'active' ? 'warning' : 'danger'}>
                  {status === 'active' ? 'Vence hoy' : 'Vencida'}
                </Badge>
                <p className="text-[11px] text-danger mt-1 leading-tight">
                  Contacta al <strong>04145180265</strong> para renovar.
                </p>
              </div>
            );
          }

          if (daysRemaining <= 3) {
            return (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-warning">
                  {new Date(expiresAt).toLocaleDateString('es-ES')}
                </p>
                <Badge variant="warning">
                  Vence en {daysRemaining} día{daysRemaining !== 1 ? 's' : ''}
                </Badge>
                <p className="text-[11px] text-warning mt-1 leading-tight">
                  Contacta al <strong>04145180265</strong> para renovar.
                </p>
              </div>
            );
          }

          return (
            <>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {new Date(expiresAt).toLocaleDateString('es-ES')}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">Próxima facturación</p>
            </>
          );
        })()}
      </div>
    </div>
  );
};
