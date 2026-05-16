import { type FC, useState, useEffect } from 'react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { EmptyState, Card, Badge } from '../../../common/components';
import { Package, AlertTriangle, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
import { displayStock } from '../../inventory/types';
import type { Product } from '../../../specs/inventory';

interface DashboardPageProps {
  tenantId?: string | null;
  userEmail?: string;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];

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

  const expiryGradient = expiryUrgency === 'expired'
    ? 'from-red-50 to-red-100/50 border-red-200/60'
    : expiryUrgency === 'critical'
      ? 'from-amber-50 to-amber-100/50 border-amber-200/60'
      : expiryUrgency === 'warning'
        ? 'from-orange-50 to-orange-100/50 border-orange-200/60'
        : 'from-blue-50 to-blue-100/50 border-blue-200/60';

  const expiryIconBg = expiryUrgency === 'expired'
    ? 'bg-red-100 text-danger'
    : expiryUrgency === 'critical' || expiryUrgency === 'warning'
      ? 'bg-amber-100 text-warning'
      : 'bg-blue-100 text-primary';

  const topQty = topProducts.length > 0 ? topProducts[0].totalQty : 1;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto pb-20 sm:pb-6">
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
        <Card className="p-4 border bg-linear-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/60 transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Ganancias de hoy</p>
              {dashboardLoading ? (
                <div className="skeleton h-6 w-16 rounded mt-1" />
              ) : (
                <p className="text-xl font-title font-bold text-emerald-700">
                  ${todayEarnings.toFixed(2)}
                </p>
              )}
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 shrink-0 ml-3">
              <DollarSign size={18} />
            </div>
          </div>
        </Card>

        {/* Suscripción */}
        <Card className={`p-4 border bg-linear-to-br ${expiryGradient} transition-shadow hover:shadow-md`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Suscripción</p>
              {dashboardLoading ? (
                <div className="skeleton h-6 w-20 rounded mt-1" />
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
            <div className={`p-2.5 rounded-xl shrink-0 ml-3 ${expiryIconBg}`}>
              <Calendar size={18} />
            </div>
          </div>
        </Card>
      </div>

      {/* Productos más vendidos */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-primary" />
            </div>
            <h3 className="text-sm font-title font-bold text-gray-900">Productos más vendidos</h3>
          </div>

          {dataLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-5 w-5 rounded-full" />
                  <div className="skeleton h-4 flex-1 rounded" />
                  <div className="skeleton h-4 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((p, i) => {
                const pct = topQty > 0 ? Math.round((p.totalQty / topQty) * 100) : 0;
                const isTop3 = i < 3;

                return (
                  <div key={p.productId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isTop3 && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: RANK_COLORS[i] }}
                          >
                            {i + 1}
                          </span>
                        )}
                        <span className="text-sm text-gray-700 truncate" title={p.name}>{p.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 shrink-0 ml-2">{p.totalQty} vendidos</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: RANK_COLORS[i] ?? '#94a3b8',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Package size={40} />}
              title="Sin datos aún"
              description="Registra productos y realiza ventas para ver estadísticas aquí."
            />
          )}
        </div>
      </Card>

      {/* Stock bajo */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-warning" />
            </div>
            <h3 className="text-sm font-title font-bold text-gray-900">Stock bajo</h3>
            {lowStock.length > 0 && (
              <Badge variant="warning">{lowStock.length}</Badge>
            )}
          </div>

          {dataLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-4 flex-1 rounded" />
                  <div className="skeleton h-6 w-12 rounded" />
                </div>
              ))}
            </div>
          ) : lowStock.length > 0 ? (
            <div className="space-y-3">
              {lowStock.map((p) => {
                const isZero = p.stock <= 0;
                const stockMin = p.stockMin ?? 1;
                const pct = stockMin > 0 ? Math.min((p.stock / stockMin) * 100, 100) : 0;

                return (
                  <div key={p.id} className={`rounded-lg border p-3 transition-shadow ${isZero ? 'bg-danger/5 border-danger/20' : 'bg-surface-alt border-border'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800 truncate flex-1" title={p.name}>{p.name}</span>
                      <Badge variant={isZero ? 'danger' : 'warning'} className="shrink-0 ml-2">
                        {displayStock(p.stock, p.unit)} {p.unit}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isZero ? 'var(--color-danger)' : 'var(--color-warning)',
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-text-secondary shrink-0">Min: {stockMin}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<AlertTriangle size={40} />}
              title="Todo en orden"
              description="Todos tus productos tienen stock suficiente."
            />
          )}
        </div>
      </Card>
    </div>
  );
};
