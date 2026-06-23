import { useState, type FC } from 'react';
import { Navigate } from 'react-router-dom';
import { Tabs, Skeleton, Alert, Button } from '../../../common/components';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { useSettings } from '../hooks/useSettings';
import { FiscalTab } from './FiscalTab';
import { OperationsTab } from './OperationsTab';
import { BusinessTab } from './BusinessTab';
import { TeamTab } from './TeamTab';
import { SecurityTab } from './SecurityTab';
import { SubscriptionTab } from './SubscriptionTab';

interface SettingsPageProps {
  tenantId?: string | null;
}

const TABS = [
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'operations', label: 'Operaciones' },
  { key: 'business', label: 'Mi Negocio' },
  { key: 'team', label: 'Equipo' },
  { key: 'security', label: 'Seguridad' },
  { key: 'subscription', label: 'Suscripci\u00f3n' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export const SettingsPage: FC<SettingsPageProps> = ({ tenantId }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('fiscal');
  const session = useAuthStore((s) => s.session);
  const { loading, error, refresh } = useSettings();

  if (!session || !hasActionPermission(session, 'settings', 'manage')) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="app-shell-content app-shell-content--with-bottom-nav">
        <div className="@container w-full max-w-4xl mx-auto p-4 md:p-6">
          <Skeleton variant="title" className="mb-6" />
          <div className="overflow-x-auto flex gap-2 mb-6 pb-1">
            <Skeleton variant="shimmer" className="h-10 w-24 rounded-lg shrink-0" />
            <Skeleton variant="shimmer" className="h-10 w-32 rounded-lg shrink-0" />
            <Skeleton variant="shimmer" className="h-10 w-28 rounded-lg shrink-0" />
            <Skeleton variant="shimmer" className="h-10 w-24 rounded-lg shrink-0" />
          </div>
          <div className="space-y-4">
            <Skeleton variant="shimmer" className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="app-shell-content app-shell-content--with-bottom-nav">
        <div className="@container w-full max-w-4xl mx-auto p-4 md:p-6">
          <Alert variant="error" className="mb-4">{error}</Alert>
          <Button
            variant="secondary"
            onClick={refresh}
            className="min-h-11"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-content app-shell-content--with-bottom-nav">
      <div className="@container w-full max-w-4xl mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Ajustes del Sistema</h1>

        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 mb-6">
          <Tabs
            tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as TabKey)}
          />
        </div>

        {activeTab === 'fiscal' && (
          <div className="animate-fade-in">
            <FiscalTab tenantId={tenantId} />
          </div>
        )}
        {activeTab === 'operations' && (
          <div className="animate-fade-in">
            <OperationsTab tenantId={tenantId} />
          </div>
        )}
        {activeTab === 'business' && (
          <div className="animate-fade-in">
            <BusinessTab tenantId={tenantId} />
          </div>
        )}
        {activeTab === 'team' && tenantId && (
          <div className="animate-fade-in">
            <TeamTab tenantId={tenantId} />
          </div>
        )}
        {activeTab === 'security' && (
          <div className="animate-fade-in">
            <SecurityTab />
          </div>
        )}
        {activeTab === 'subscription' && tenantId && (
          <div className="animate-fade-in">
            <SubscriptionTab tenantId={tenantId} />
          </div>
        )}
      </div>
    </div>
  );
};
