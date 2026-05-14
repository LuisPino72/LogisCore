import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './features/auth/hooks/useAuth';
import { useAuthStore } from './features/auth/stores/authStore';
import { authService } from './features/auth/services/authService';
import { useNavigationStore } from './stores/navigationStore';
import { usePermissionStore } from './stores/permissionStore';
import { EventBus, SystemEvents } from '@logiscore/core';
import { initDb, destroyDb } from './services/dexie/db';
import { useTenantResolution } from './features/dashboard/hooks/useTenantResolution';
import {
  AppShell,
  Badge,
  Button,
  Card,
  Spinner,
  ToastContainer,
  Sidebar,
  type SidebarModule,
} from './common/components';
import {
  ShoppingCart,
  Package,
  Settings,
  Store,
  ArrowLeft,
  LayoutDashboard,
  Wallet,
  FileText,
  Truck,
} from 'lucide-react';
import { LoginPage } from './features/auth/components/LoginPage';
import { AdminPanelPage } from './features/admin/components/AdminPanelPage';
import { DashboardPage } from './features/dashboard/components/DashboardPage';
import { ExchangeRateWidget } from './features/exchange/components/ExchangeRateWidget';
import { InventoryPage } from './features/inventory';
import { PosPage } from './features/pos';
import { PurchasePage } from './features/purchases';

const ALL_MODULES: SidebarModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'pos', label: 'POS', icon: <ShoppingCart size={20} /> },
  { id: 'inventory', label: 'Inventario', icon: <Package size={20} /> },
  { id: 'purchases', label: 'Compras', icon: <Truck size={20} /> },
  { id: 'cash', label: 'Caja', icon: <Wallet size={20} /> },
  { id: 'reports', label: 'Reportes', icon: <FileText size={20} /> },
  { id: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
];

const EMPLOYEE_ALLOWED = new Set(['dashboard', 'pos', 'inventory']);

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'POS',
  inventory: 'Inventario',
  purchases: 'Compras',
  cash: 'Caja',
  reports: 'Reportes',
  settings: 'Ajustes',
};

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

function ModulePlaceholder({ moduleId }: { moduleId: string }) {
  const label = MODULE_LABELS[moduleId] ?? moduleId;
  return (
    <div className="p-4 max-w-5xl mx-auto">
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
            <Package size={32} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-title font-bold text-gray-700 mb-1">{label}</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Este módulo está en desarrollo. Pronto podrás usarlo.
          </p>
        </div>
      </Card>
    </div>
  );
}

function DashboardLayout() {
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useNavigationStore((s) => s.selectedTenantSlug);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(false); 

  const isAdmin = session?.role === 'admin';
  const isAdminViewingTenant = isAdmin && selectedTenantSlug !== null;
  const role = session?.role ?? null;

  const sidebarModules = role === 'employee'
    ? ALL_MODULES.filter((m) => EMPLOYEE_ALLOWED.has(m.id))
    : ALL_MODULES;

  const effectiveTenantId = useTenantResolution({ session, selectedTenantSlug, isAdminViewingTenant });

  const handleNavigate = useCallback((moduleId: string) => {
    setActiveModule(moduleId);
  }, []);

  const handleLogout = useCallback(async () => {
    const result = await authService.signOut();
    if (!result.ok) {
      console.error('[App] Error al cerrar sesión:', result.error.message);
    }
  }, []);

  const renderContent = () => {
    // Employee route protection: redirigir al dashboard si no tiene permiso
    if (role === 'employee' && !EMPLOYEE_ALLOWED.has(activeModule)) {
      return <DashboardPage tenantId={effectiveTenantId} userEmail={session?.email} />;
    }
    switch (activeModule) {
      case 'dashboard':
        return <DashboardPage tenantId={effectiveTenantId} userEmail={session?.email} />;
      case 'inventory':
        return <InventoryPage tenantId={effectiveTenantId} />;
      case 'purchases':
        return <PurchasePage tenantId={effectiveTenantId} />;
      case 'pos':
        return <PosPage tenantId={effectiveTenantId} />;
      default:
        return <ModulePlaceholder moduleId={activeModule} />;
    }
  };

  return (
    <AppShell
      topBar={

        <>
          {/* topbar menu button removed: sidebar has its own hamburger in mobile */}
          {isAdminViewingTenant && (
            <Button variant="ghost" size="sm" onClick={() => EventBus.emit(SystemEvents.ADMIN_EXIT_TENANT)}>
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Volver al Panel</span>
            </Button>
          )}
          <Store size={20} className="text-primary shrink-0" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNavigate('dashboard')}
            className="font-semibold text-sm flex-1 text-left"
          >
            LogisCore
          </Button>
          {role && <Badge variant="success">{role}</Badge>}
        </>
      }
      sidebar={
        <Sidebar
          isOpen={sidebarOpen}
          expanded={sidebarExpanded}
          onToggleExpanded={(v: boolean) => setSidebarExpanded(v)}
          onClose={() => setSidebarOpen(false)}
          modules={sidebarModules}
          activeModule={activeModule}
          onNavigate={handleNavigate}
          userEmail={session?.email ?? ''}
          onLogout={handleLogout}
          footerSlot={
            effectiveTenantId ? (
              <ExchangeRateWidget tenantId={effectiveTenantId} role={role ?? null} />
            ) : undefined
          }
        />
      }
      sidebarOpen={sidebarOpen}
      sidebarExpanded={sidebarExpanded}
    >
      {renderContent()}
    </AppShell>
  );
}

const App = () => {
  const { isAuthenticated, isLoading, role } = useAuth();
  const error = useAuthStore((s) => s.error);
  const session = useAuthStore((s) => s.session);
  const { currentView, setView } = useNavigationStore();

  useEffect(() => {
    if (isAuthenticated && currentView === 'loading') {
      setView(role === 'admin' ? 'admin' : 'dashboard', role === 'admin' ? null : (session?.tenantSlug ?? null));
    }
  }, [isAuthenticated, role, session, currentView, setView]);

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
        initDb(tenantSlug);
        setView('dashboard', tenantSlug);
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_EXIT_TENANT, () => {
        destroyDb();
        setView('admin');
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.USER_LOGOUT, () => {
        useNavigationStore.getState().setView('login');
        usePermissionStore.getState().clear();
        useAuthStore.getState().clearSession();
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
      <DashboardLayout />
      <ToastContainer />
    </>
  );
};

export default App;
