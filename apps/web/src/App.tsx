import { useEffect } from 'react';
import { useAuth } from './features/auth/hooks/useAuth';
import { useAuthStore } from './features/auth/stores/authStore';
import { useNavigationStore } from './stores/navigationStore';
import { EventBus, SystemEvents } from '@logiscore/core';
import {
  AppShell,
  Badge,
  BottomNav,
  Button,
  Card,
  Spinner,
  ToastContainer,
} from './common/components';
import { ShoppingCart, Package, BarChart3, Settings, Store } from 'lucide-react';
import { LoginPage } from './features/auth/components/LoginPage';
import { AdminPanelPage } from './features/admin/components/AdminPanelPage';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-gray-500 text-sm">Cargando...</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-surface p-8 flex flex-col items-center justify-center gap-4">
      <Card className="max-w-md w-full">
        <p className="text-danger text-sm">{message}</p>
        <Button variant="primary" fullWidth className="mt-4" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </Card>
    </div>
  );
}

function Dashboard() {
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useNavigationStore((s) => s.selectedTenantSlug);

  const navItems = [
    { key: 'pos', label: 'POS', icon: <ShoppingCart size={24} />, onClick: () => {} },
    { key: 'inventory', label: 'Inventario', icon: <Package size={24} />, onClick: () => {}, badge: 3 },
    { key: 'reports', label: 'Reportes', icon: <BarChart3 size={24} />, onClick: () => {} },
    { key: 'settings', label: 'Ajustes', icon: <Settings size={24} />, onClick: () => {} },
  ];

  const displaySlug = selectedTenantSlug ?? session?.tenantSlug;

  return (
    <AppShell
      topBar={
        <>
          <Store size={20} className="text-primary" />
          <span className="font-semibold text-sm flex-1">LogisCore</span>
          {displaySlug && <Badge variant="info">{displaySlug}</Badge>}
          {session?.role && <Badge variant="success">{session.role}</Badge>}
        </>
      }
      bottomNav={<BottomNav items={navItems} activeKey="pos" />}
    >
      <div className="p-4 space-y-4">
        <Card>
          <p className="text-sm text-gray-500">
            Bienvenido, <strong>{session?.email}</strong>
          </p>
        </Card>
        <Card header="Resumen">
          <p className="text-sm text-gray-500">Infraestructura inicializada correctamente</p>
        </Card>
      </div>
    </AppShell>
  );
}

const App = () => {
  const { isAuthenticated, isLoading, role } = useAuth();
  const error = useAuthStore((s) => s.error);
  const { currentView, setView } = useNavigationStore();

  useEffect(() => {
    const subs: ReturnType<typeof EventBus.on>[] = [];

    subs.push(
      EventBus.on(SystemEvents.USER_LOGIN, (payload: unknown) => {
        const { role: loginRole, tenantSlug } = payload as { role?: string; tenantSlug?: string | null };
        if (loginRole === 'admin') {
          setView('admin');
        } else {
          setView('dashboard', tenantSlug ?? null);
        }
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_NAVIGATE_TENANT, (payload: unknown) => {
        const { tenantSlug } = payload as { tenantSlug: string };
        setView('dashboard', tenantSlug);
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_EXIT_TENANT, () => {
        setView('admin');
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [setView]);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!isAuthenticated) return <LoginPage />;

  if (currentView === 'admin' && role === 'admin') {
    return (
      <>
        <AdminPanelPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Dashboard />
      <ToastContainer />
    </>
  );
};

export default App;
