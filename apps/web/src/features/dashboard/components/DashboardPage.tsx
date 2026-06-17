import { type FC, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { PwaInstallBanner } from './PwaInstallBanner';
import { PendingTasksWidget } from './PendingTasksWidget';
import { EmptyState, Card, Badge } from '../../../common/components';
import { Package, AlertTriangle, TrendingUp, ShieldBan, Trophy, Medal, ChevronDown, ChevronUp, DollarSign, ShoppingCart } from 'lucide-react';
import { displayStock } from '../../inventory/types';
import { formatUsd } from '../../../lib/formatBs';

interface DashboardPageProps {
  tenantId?: string | null;
  userEmail?: string;
}

const RANK_STYLES = [
  { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', label: '1°' },
  { bg: 'linear-gradient(135deg, #94a3b8, #64748b)', label: '2°' },
  { bg: 'linear-gradient(135deg, #cd7f32, #a0522d)', label: '3°' },
];

const RANK_ICONS = [Trophy, Medal, Medal];

export const DashboardPage: FC<DashboardPageProps> = ({ tenantId: propTenantId, userEmail }) => {
  const session = useAuthStore((s) => s.session);
  const role = session?.role;
  const tenantId = propTenantId ?? session?.tenantId ?? null;
  const email = userEmail ?? session?.email ?? 'Usuario';
  const navigate = useNavigate();

  if (role === 'employee') {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-20 h-20 rounded-2xl bg-danger/10 flex items-center justify-center mb-6 ring-1 ring-danger/20">
            <ShieldBan size={40} className="text-danger" />
          </div>
          <h2 className="text-xl font-title font-bold text-gray-900 mb-2">Acceso restringido</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Solo el propietario del local puede acceder al Dashboard. Ve a la sección de Ventas desde el menú.
          </p>
        </div>
      </div>
    );
  }

  const {
    tenantInfo,
    subscription,
    error: dashboardError,
    topProducts,
    topProductsLoading,
    lowStockProducts,
    lowStockLoading,
    todayEarnings,
    todayEarningsLoading,
    pendingTasks,
    pendingTasksLoading,
    fetchTopProducts,
  } = useDashboard(tenantId);

  const [showAllLowStock, setShowAllLowStock] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetchTopProducts(tenantId);
  }, [tenantId, fetchTopProducts]);

  const top5LowStock = useMemo(() => lowStockProducts.slice(0, 5), [lowStockProducts]);

  const topQty = topProducts.length > 0 ? topProducts[0].totalQty : 1;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto dashboard-container">
      <WelcomeBanner
        userName={email}
        tenantName={tenantInfo?.name ?? null}
        logoUrl={tenantInfo?.logoUrl ?? null}
        subscription={subscription}
      />

      <PwaInstallBanner />

      <div className="dashboard-grid mt-4 sm:mt-6">
        {/* Ganancias de hoy */}
        <div className="dashboard-card-entrance" style={{ animationDelay: '0.1s' }}>
          <Card>
            <div className="p-4 sm:p-5 dashboard-kpi-card" style={{ '--kpi-accent': 'var(--color-success)' } as React.CSSProperties}>
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign size={16} className="text-success" />
                </div>
                <h3 className="text-sm font-title font-bold text-gray-900">Ganancias de hoy</h3>
              </div>
              {todayEarningsLoading ? (
                <div className="space-y-3">
                  <div className="skeleton h-8 w-32 rounded" />
                </div>
              ) : todayEarnings != null && todayEarnings > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="text-left w-full group min-h-[44px]"
                >
                  <p className="dashboard-kpi-amount font-title font-bold text-success group-hover:text-success/80 transition-colors">
                    {formatUsd(todayEarnings)}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Ver reportes →</p>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="text-left w-full group min-h-[44px]"
                >
                  <p className="text-lg font-title font-bold text-gray-400 group-hover:text-gray-500 transition-colors">
                    Sin ventas hoy
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Ver reportes →</p>
                </button>
              )}
            </div>
          </Card>
        </div>

        {!pendingTasksLoading && (
          <div className="dashboard-card-entrance" style={{ animationDelay: '0.12s' }}>
            <Card>
              <div className="p-4 sm:p-5">
                <PendingTasksWidget tasks={pendingTasks} loading={pendingTasksLoading} />
              </div>
            </Card>
          </div>
        )}

        {dashboardError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-warning/8 border border-warning/20 text-sm text-warning animate-slide-down dashboard-card--full">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{dashboardError}</span>
          </div>
        )}

        {/* Productos más vendidos */}
        <div className="dashboard-card-entrance" style={{ animationDelay: '0.05s' }}>
          <Card>
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp size={16} className="text-primary" />
                </div>
                <h3 className="text-sm font-title font-bold text-gray-900">Productos más vendidos</h3>
              </div>

              {topProductsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-6 w-6 rounded-full" />
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
                    const RankIcon = isTop3 ? RANK_ICONS[i] : null;

                    return (
                      <div key={p.productId}>
                        <div className="mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {isTop3 ? (
                              <div
                                className="rank-badge"
                                style={{ background: RANK_STYLES[i].bg }}
                              >
                                {RankIcon && <RankIcon size={10} />}
                              </div>
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-400 shrink-0">
                                {i + 1}
                              </span>
                            )}
                            <span className="text-sm text-gray-700 truncate flex-1 min-w-0" title={p.name}>{p.name}</span>
                          </div>
                          <span className="text-xs text-gray-600 ml-8 block">{p.totalQty} {p.isWeighted ? 'kg vendidos' : 'vendidos'}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-8 progress-bar-shimmer">
                          <div
                            className="h-full rounded-full progress-fill"
                            style={{
                              width: `${pct}%`,
                              background: isTop3
                                ? RANK_STYLES[i].bg
                                : '#94a3b8',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6">
                  <EmptyState
                    icon={<Package size={40} />}
                    title="Sin datos aún"
                    description="Registra productos y realiza ventas para ver estadísticas aquí."
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Stock bajo */}
        <div className="dashboard-card-entrance" style={{ animationDelay: '0.15s' }}>
          <Card>
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-warning" />
                </div>
                <h3 className="text-sm font-title font-bold text-gray-900">Stock bajo</h3>
                {lowStockProducts.length > 0 && (
                  <Badge variant="warning">{lowStockProducts.length}</Badge>
                )}
              </div>

              {lowStockLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-4 flex-1 rounded" />
                      <div className="skeleton h-6 w-12 rounded" />
                    </div>
                  ))}
                </div>
              ) : lowStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {(showAllLowStock ? lowStockProducts : top5LowStock).map((p) => {
                    const isZero = p.stock <= 0;
                    const stockMin = p.stockMin ?? 1;
                    const pct = stockMin > 0 ? Math.min((p.stock / stockMin) * 100, 100) : 0;

                    return (
                      <div key={p.id} className={`low-stock-card ${isZero ? 'low-stock-card--danger' : 'low-stock-card--warning'}`}>
                        <div className="flex items-center justify-between gap-x-2 gap-y-1 mb-2">
                          <span className="text-sm font-medium text-gray-800 wrap-break-word min-w-0 flex-1" title={p.name}>{p.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={isZero ? 'danger' : 'warning'}>
                              {displayStock(p.stock, p.unit)} {p.unit}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => navigate('/purchases')}
                              className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-primary hover:text-primary-dark hover:bg-primary/5 transition-colors"
                              title="Crear orden de compra"
                            >
                              <ShoppingCart size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden progress-bar-shimmer">
                            <div
                              className="h-full rounded-full progress-fill"
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
                  {lowStockProducts.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllLowStock(!showAllLowStock)}
                      className="w-full flex items-center justify-center gap-1 text-xs font-medium text-primary hover:text-primary-dark py-2.5 rounded-lg hover:bg-primary/5 transition-all duration-200 mt-1 min-h-[44px]"
                    >
                      {showAllLowStock ? (
                        <>Mostrar menos <ChevronUp size={14} /></>
                      ) : (
                        <>Ver {lowStockProducts.length - 5} más <ChevronDown size={14} /></>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-6">
                  <EmptyState
                    icon={<AlertTriangle size={40} />}
                    title="Todo en orden"
                    description="Todos tus productos tienen stock suficiente."
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
