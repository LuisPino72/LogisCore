import { Building2, Users, AlertTriangle, Ban } from 'lucide-react';
import type { DashboardStats } from '../types';

interface AdminDashboardProps {
  stats: DashboardStats;
  expiredCount: number;
}

const statCards = [
  {
    key: 'active',
    label: 'Locales Activos',
    icon: Building2,
    gradient: 'from-blue-600 to-blue-500',
    shadow: 'shadow-blue-500/10',
    bgLight: 'bg-blue-50',
    getValue: (s: DashboardStats) => s.totalActiveTenants,
  },
  {
    key: 'inactive',
    label: 'Locales Inactivos',
    icon: Ban,
    gradient: 'from-gray-500 to-gray-400',
    shadow: 'shadow-gray-500/10',
    bgLight: 'bg-gray-50',
    getValue: (s: DashboardStats) => s.totalInactiveTenants,
  },
  {
    key: 'expiring',
    label: 'Por Vencer (≤7d)',
    icon: AlertTriangle,
    gradient: 'from-amber-500 to-amber-400',
    shadow: 'shadow-amber-500/10',
    bgLight: 'bg-amber-50',
    getValue: (s: DashboardStats) => s.expiringSubscriptions,
  },
  {
    key: 'users',
    label: 'Usuarios Totales',
    icon: Users,
    gradient: 'from-emerald-600 to-emerald-500',
    shadow: 'shadow-emerald-500/10',
    bgLight: 'bg-emerald-50',
    getValue: (s: DashboardStats) => s.totalUsers,
  },
];

export function AdminDashboard({ stats, expiredCount }: AdminDashboardProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {expiredCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm animate-fade-in">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="flex-1">
            <span className="font-semibold">{expiredCount} suscripción{expiredCount !== 1 ? 'es' : ''} vencida{expiredCount !== 1 ? 's' : ''}</span>
            <span className="text-red-600/80 ml-1">— renovarlas desde la pestaña Suscripciones.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = card.getValue(stats);
          return (
            <div
              key={card.key}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-px group"
            >
              <div className="p-4 sm:p-5">
                <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${card.gradient} ${card.shadow} flex items-center justify-center mb-3 shadow-sm`}>
                  <Icon size={20} className="text-white" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 font-title">{value}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{card.label}</p>
              </div>
              <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full ${card.bgLight} opacity-50 group-hover:opacity-70 transition-opacity`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
