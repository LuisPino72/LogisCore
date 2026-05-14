import { type FC, useState, useEffect } from 'react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { StatsGrid } from './StatsGrid';
import { EmptyState, Card, Badge, Spinner } from '../../../common/components';
import { Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
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
    employees,
    subscription,
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

      <StatsGrid
        employees={employees}
        plan={subscription?.plan ?? null}
        status={subscription?.status ?? null}
        expiresAt={subscription?.expires_at ?? null}
        loading={dashboardLoading}
      />

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
                <div key={p.productId} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={i === 0 ? 'success' : 'neutral'}>#{i + 1}</Badge>
                    <span className="text-sm text-gray-700">{p.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{p.totalQty} vendidos</span>
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
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-sm text-gray-700">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Min: {p.stockMin}</span>
                    <Badge variant="danger">{p.stock} restantes</Badge>
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
