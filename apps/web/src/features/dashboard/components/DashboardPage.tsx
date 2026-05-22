import { type FC, useState, useEffect } from 'react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { EmptyState, Card, Badge } from '../../../common/components';
import { Package, AlertTriangle, TrendingUp, ShieldBan } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';
import { displayStock } from '../../inventory/types';
import { useInventoryStore } from '../../inventory/stores/inventoryStore';
import { EventBus } from '@logiscore/core';

interface DashboardPageProps {
  tenantId?: string | null;
  userEmail?: string;
}

const RANK_COLORS = ['#F59E0B', '#94a3b8', '#cd7f32'];

export const DashboardPage: FC<DashboardPageProps> = ({ tenantId: propTenantId, userEmail }) => {
  const session = useAuthStore((s) => s.session);
  const role = session?.role;
  const tenantId = propTenantId ?? session?.tenantId ?? null;
  const email = userEmail ?? session?.email ?? 'Usuario';

  if (role === 'employee') {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <Card>
          <EmptyState
            icon={<ShieldBan size={48} />}
            title="Acceso restringido"
            description="Solo el propietario del local puede acceder al Dashboard."
          />
        </Card>
      </div>
    );
  }

  const {
    tenantInfo,
    subscription,
    error: dashboardError,
  } = useDashboard(tenantId);

  const lowStock = useInventoryStore((s) => s.lowStockProducts);
  const fetchLowStock = useInventoryStore((s) => s.fetchLowStock);
  const [topProducts, setTopProducts] = useState<{ productId: string; name: string; totalQty: number }[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setLowStockLoading(true);
    fetchLowStock(tenantId).finally(() => setLowStockLoading(false));
    const sub1 = EventBus.on('SYNC.REFRESH_PRODUCTS', () => fetchLowStock(tenantId));
    const sub2 = EventBus.on('SALE.COMPLETED', () => fetchLowStock(tenantId));
    return () => {
      EventBus.off(sub1);
      EventBus.off(sub2);
    };
  }, [tenantId, fetchLowStock]);

  useEffect(() => {
    if (!tenantId) return;
    setDataLoading(true);
    dashboardService.getTopProducts(tenantId).then((top) => {
      if (top.ok) setTopProducts(top.data);
      setDataLoading(false);
    });
  }, [tenantId]);

  const topQty = topProducts.length > 0 ? topProducts[0].totalQty : 1;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <WelcomeBanner
        userName={email}
        tenantName={tenantInfo?.name ?? null}
        subscription={subscription}
      />

      {dashboardError && (
        <div className="alert alert-warning">
          <AlertTriangle size={16} />
          <span className="text-sm">{dashboardError}</span>
        </div>
      )}

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
                        <span className="text-sm text-gray-700 wrap-break-word" title={p.name}>{p.name}</span>
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

          {lowStockLoading ? (
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
              {(showAllLowStock ? lowStock : lowStock.slice(0, 5)).map((p) => {
                const isZero = p.stock <= 0;
                const stockMin = p.stockMin ?? 1;
                const pct = stockMin > 0 ? Math.min((p.stock / stockMin) * 100, 100) : 0;

                return (
                  <div key={p.id} className={`rounded-lg border p-3 transition-shadow ${isZero ? 'bg-danger/5 border-danger/20' : 'bg-surface-alt border-border'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800 wrap-break-word flex-1" title={p.name}>{p.name}</span>
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
              {lowStock.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllLowStock(!showAllLowStock)}
                  className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 py-2 rounded-lg hover:bg-primary/5 transition-colors"
                >
                  {showAllLowStock ? 'Mostrar menos ↑' : `Ver ${lowStock.length - 5} más →`}
                </button>
              )}
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
