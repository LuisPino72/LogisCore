import { type FC, useState, useEffect } from 'react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { EmptyState, Card, Badge, Spinner } from '../../../common/components';
import { Package, AlertTriangle, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
import { displayStock } from '../../inventory/types';
import type { Product } from '../../../specs/inventory';

interface DashboardPageProps {
  tenantId?: string | null;
  userEmail?: string;
}

export const DashboardPage: FC<DashboardPageProps> = ({ tenantId: propTenantId, userEmail }) => {
  const session = useAuthStore((s) => s.session);
  const tenantId = propTenantId ?? session?.tenantId ?? null;
  const email = userEmail ?? session?.email ?? 'Usuario';

  const {
    tenantInfo,
    subscription,
    todayEarnings,
    loading: dashboardLoading,
    error: dashboardError,
  } = useDashboard(tenantId);

  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [topProducts, setTopProducts] = useState<{ productId: string; name: string; totalQty: number }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setDataLoading(true);
    Promise.all([
      dashboardService.getLowStockProducts(tenantId),
      dashboardService.getTopProducts(tenantId),
    ]).then(([low, top]) => {
      if (low.ok) setLowStock(low.data);
      if (top.ok) setTopProducts(top.data);
      setDataLoading(false);
    });
  }, [tenantId]);

  const daysRemaining = subscription?.expires_at
    ? Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  const expiryUrgency = daysRemaining !== null && daysRemaining <= 0
    ? 'expired'
    : daysRemaining !== null && daysRemaining <= 3
      ? 'critical'
      : daysRemaining !== null && daysRemaining <= 7
        ? 'warning'
        : 'ok';

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <WelcomeBanner
        userName={email}
        tenantName={tenantInfo?.name ?? null}
      />

      {dashboardError && (
        <div className="alert alert-warning">
          <AlertTriangle size={16} />
          <span className="text-sm">{dashboardError}</span>
        </div>
      )}

      {/* Stats: Ganancias de hoy + Suscripción */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ganancias de hoy */}
        <Card className="p-4 border-l-4 border-l-success">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <DollarSign size={20} className="text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-secondary">Ganancias de hoy</p>
              {dashboardLoading ? (
                <div className="skeleton-text w-20 mt-1" />
              ) : (
                <p className="text-xl font-title font-bold text-success">
                  ${todayEarnings.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Suscripción */}
        <Card className={`p-4 border-l-4 ${
          expiryUrgency === 'expired' ? 'border-l-danger'
            : expiryUrgency === 'critical' ? 'border-l-warning'
            : expiryUrgency === 'warning' ? 'border-l-orange-500'
            : 'border-l-primary'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              expiryUrgency === 'expired' ? 'bg-red-100'
                : expiryUrgency === 'critical' || expiryUrgency === 'warning' ? 'bg-amber-100'
                : 'bg-blue-100'
            }`}>
              <Calendar size={20} className={
                expiryUrgency === 'expired' ? 'text-danger'
                  : expiryUrgency === 'critical' || expiryUrgency === 'warning' ? 'text-warning'
                  : 'text-primary'
              } />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-secondary">Suscripción</p>
              {dashboardLoading ? (
                <div className="skeleton-text w-24 mt-1" />
              ) : daysRemaining === null ? (
                <p className="text-sm font-semibold text-gray-900">-</p>
              ) : daysRemaining <= 0 ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-danger">VENCIDA</p>
                  <p className="text-[11px] text-danger leading-tight">
                    Contacta al <strong>04145180265</strong>
                  </p>
                </div>
              ) : daysRemaining <= 3 ? (
                <div className="space-y-0.5">
                  <Badge variant="warning">Vence en {daysRemaining}d</Badge>
                  <p className="text-[11px] text-warning leading-tight">
                    Contacta al <strong>04145180265</strong>
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString('es-ES') : '-'}
                  </p>
                  <p className="text-[11px] text-text-secondary">{daysRemaining} días restantes</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Productos más vendidos */}
      <Card>
        {dataLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : topProducts.length > 0 ? (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              <h3 className="text-sm font-semibold text-gray-800">Productos más vendidos</h3>
            </div>
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center justify-between py-1.5 border-b border-gray-200 last:border-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant={i === 0 ? 'success' : 'neutral'}>#{i + 1}</Badge>
                    <span className="text-sm text-gray-700 truncate" title={p.name}>{p.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 shrink-0 ml-2">{p.totalQty} vendidos</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Package size={40} />}
            title="Productos más vendidos"
            description="Aún no hay datos. Registra tus primeros productos y realiza ventas para ver estadísticas aquí."
          />
        )}
      </Card>

      {/* Stock bajo */}
      <Card>
        {dataLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : lowStock.length > 0 ? (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <h3 className="text-sm font-semibold text-gray-800">Stock bajo</h3>
              <Badge variant="warning">{lowStock.length}</Badge>
            </div>
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-200 last:border-0">
                  <span className="text-sm text-gray-700 truncate" title={p.name}>{p.name}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-gray-500">Min: {p.stockMin}</span>
                    <Badge variant="danger">{displayStock(p.stock, p.unit)} {p.unit}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<AlertTriangle size={40} />}
            title="Stock bajo"
            description="Todos tus productos tienen stock suficiente."
          />
        )}
      </Card>
    </div>
  );
};
