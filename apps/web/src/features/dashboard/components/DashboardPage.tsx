import { type FC } from 'react';
import { useAuthStore } from '../../auth/stores/authStore';
import { useDashboard } from '../hooks/useDashboard';
import { WelcomeBanner } from './WelcomeBanner';
import { StatsGrid } from './StatsGrid';
import { EmptyState, Card } from '../../../common/components';
import { Package, AlertTriangle } from 'lucide-react';

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
    loading,
    error,
  } = useDashboard(tenantId);

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <WelcomeBanner
        userName={email}
        tenantName={tenantInfo?.name ?? null}
      />

      {error && (
        <div className="alert alert-warning">
          <AlertTriangle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <StatsGrid
        employees={employees}
        plan={subscription?.plan ?? null}
        status={subscription?.status ?? null}
        expiresAt={subscription?.expires_at ?? null}
        loading={loading}
      />

      <Card>
        <EmptyState
          icon={<Package size={40} />}
          title="Productos más vendidos"
          description="Aún no hay datos. Registra tus primeros productos y realiza ventas para ver estadísticas aquí."
        />
      </Card>

      <Card>
        <EmptyState
          icon={<AlertTriangle size={40} />}
          title="Stock bajo"
          description="Aún no hay productos registrados. Agrega inventario para recibir alertas de stock bajo."
        />
      </Card>
    </div>
  );
};
