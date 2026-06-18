import { ShoppingCart, Package, Users } from 'lucide-react';
import { Modal, Spinner } from '../../../common/components';
import type { TenantAnalytics } from '../types';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName: string;
  analytics: TenantAnalytics | null;
  isLoading: boolean;
}

const analyticsCards = [
  {
    key: 'sales',
    label: 'Ventas del Mes',
    icon: ShoppingCart,
    gradient: 'from-blue-600 to-blue-500',
    bgLight: 'bg-blue-50',
    getValue: (a: TenantAnalytics) => a.monthlySalesCount,
    suffix: 'ventas',
  },
  {
    key: 'products',
    label: 'Productos Activos',
    icon: Package,
    gradient: 'from-emerald-600 to-emerald-500',
    bgLight: 'bg-emerald-50',
    getValue: (a: TenantAnalytics) => a.activeProducts,
    suffix: 'productos',
  },
  {
    key: 'users',
    label: 'Usuarios',
    icon: Users,
    gradient: 'from-amber-500 to-amber-400',
    bgLight: 'bg-amber-50',
    getValue: (a: TenantAnalytics) => a.totalUsers,
    suffix: 'usuarios',
  },
];

export function AnalyticsModal({ isOpen, onClose, tenantName, analytics, isLoading }: AnalyticsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Analytics: ${tenantName}`}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 admin-section-reveal">
            <Spinner size="lg" />
          </div>
        ) : analytics ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 admin-stagger">
            {analyticsCards.map((card) => {
              const Icon = card.icon;
              const value = card.getValue(analytics);
              return (
                <div
                  key={card.key}
                  className="rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 hover:shadow-md admin-card-hover"
                >
                  <div className={`w-9 h-9 rounded-lg bg-linear-to-br ${card.gradient} flex items-center justify-center mb-2.5 shadow-sm`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <p className="text-xl font-bold text-gray-900 font-title">{value}</p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No se pudieron cargar los analytics.</p>
        )}
      </div>
    </Modal>
  );
}
