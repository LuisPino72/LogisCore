import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/hooks/useAuth';
import { useAuthStore } from './features/auth/stores/authStore';
import { authService } from './features/auth/services/authService';
import { sessionGuard } from './features/auth/services/sessionGuardService';
import { EventBus, SystemEvents } from '@logiscore/core';
import { initDb, destroyDb } from './services/dexie/db';
import { useTenantResolution } from './features/dashboard/hooks/useTenantResolution';
import { logger } from './lib/logger';
import {
  AppShell,
  Badge,
  Button,
  Card,
  Spinner,
  ModuleSkeleton,
  ToastContainer,
  Sidebar,
  ErrorBoundary,
  type SidebarModule,
} from './common/components';
import {
  ShoppingCart,
  Package,
  Store,
  ArrowLeft,
  LayoutDashboard,
  FileText,
  Truck,
} from 'lucide-react';
import { LoginPage } from './features/auth/components/LoginPage';
import { AdminPanelPage } from './features/admin/components/AdminPanelPage';
import { ExchangeRateWidget } from './features/exchange/components/ExchangeRateWidget';

const DashboardPage = lazy(() => import('./features/dashboard').then((m) => ({ default: m.DashboardPage })));
const InventoryPage = lazy(() => import('./features/inventory').then((m) => ({ default: m.InventoryPage })));
const PosPage = lazy(() => import('./features/pos').then((m) => ({ default: m.PosPage })));
const PurchasePage = lazy(() => import('./features/purchases').then((m) => ({ default: m.PurchasePage })));
const ReportsPage = lazy(() => import('./features/reports').then((m) => ({ default: m.ReportsPage })));

const ALL_MODULES: SidebarModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'inventory', label: 'Inventario', icon: <Package size={20} /> },
  { id: 'purchases', label: 'Compras', icon: <Truck size={20} /> },
  { id: 'pos', label: 'POS', icon: <ShoppingCart size={20} /> },
  { id: 'reports', label: 'Reportes', icon: <FileText size={20} /> },
];

const EMPLOYEE_ALLOWED = new Set(['pos']);

const MODULE_ROUTE_MAP: Record<string, string> = {
  dashboard: '/dashboard',
  inventory: '/inventory',
  purchases: '/purchases',
  pos: '/pos',
  reports: '/reports',
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

function useSyncModuleFromRoute() {
  const location = useLocation();
  const path = location.pathname;
  if (path.startsWith('/inventory')) return 'inventory';
  if (path.startsWith('/purchases')) return 'purchases';
  if (path.startsWith('/pos')) return 'pos';
  if (path.startsWith('/reports')) return 'reports';
  return 'dashboard';
}

function DashboardLayout() {
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useAuthStore((s) => s.selectedTenantSlug);
  const navigate = useNavigate();
  const location = useLocation();
  const activeModule = useSyncModuleFromRoute();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  const isAdmin = session?.role === 'admin';
  const isAdminViewingTenant = isAdmin && selectedTenantSlug !== null;
  const role = session?.role ?? null;

  const knownModulePaths = ['/dashboard', '/inventory', '/purchases', '/pos', '/reports'];
  const isKnownModulePath = knownModulePaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/')
  );
  if (!isKnownModulePath) {
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;
  }

  const sidebarModules = role === 'employee'
    ? ALL_MODULES.filter((m) => EMPLOYEE_ALLOWED.has(m.id))
    : ALL_MODULES;

  const effectiveTenantId = useTenantResolution({ session, selectedTenantSlug, isAdminViewingTenant });

  const handleNavigate = useCallback((moduleId: string) => {
    const route = MODULE_ROUTE_MAP[moduleId] ?? '/dashboard';
    navigate(route);
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    const result = await authService.signOut();
    if (!result.ok) {
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  return (
    <AppShell
      topBar={
        <>
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
            Sasa
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
      <ErrorBoundary moduleName="Dashboard">
        {/* KeepAlive: todos los módulos siempre en DOM, solo cambia visibilidad */}
        <div className={`${activeModule !== 'dashboard' ? 'hidden' : ''} animate-fade-in`}>
          <Suspense fallback={<ModuleSkeleton />}>
            <DashboardPage tenantId={effectiveTenantId} userEmail={session?.email} />
          </Suspense>
        </div>
        <div className={`${activeModule !== 'inventory' ? 'hidden' : ''} animate-fade-in`}>
          <Suspense fallback={<ModuleSkeleton />}>
            <InventoryPage tenantId={effectiveTenantId} />
          </Suspense>
        </div>
        <div className={`${activeModule !== 'purchases' ? 'hidden' : ''} animate-fade-in`}>
          <Suspense fallback={<ModuleSkeleton />}>
            <PurchasePage tenantId={effectiveTenantId} />
          </Suspense>
        </div>
        <div className={`${activeModule !== 'pos' ? 'hidden' : ''} animate-fade-in`}>
          <Suspense fallback={<ModuleSkeleton />}>
            <PosPage tenantId={effectiveTenantId} />
          </Suspense>
        </div>
        <div className={`${activeModule !== 'reports' ? 'hidden' : ''} animate-fade-in`}>
          <Suspense fallback={<ModuleSkeleton />}>
            <ReportsPage tenantId={effectiveTenantId} />
          </Suspense>
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useAuthStore((s) => s.selectedTenantSlug);
  const role = session?.role;

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (role === 'admin' && !selectedTenantSlug) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const role = useAuthStore((s) => s.session?.role);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'admin') return <Navigate to={role === 'employee' ? '/inventory' : '/dashboard'} replace />;

  return <>{children}</>;
}

function AuthRedirect() {
  const { isAuthenticated } = useAuth();
  const role = useAuthStore((s) => s.session?.role);

  if (isAuthenticated) {
    return <Navigate to={role === 'admin' ? '/admin' : role === 'employee' ? '/pos' : '/dashboard'} replace />;
  }

  return <LoginPage />;
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    const subs: ReturnType<typeof EventBus.on>[] = [];

    subs.push(
      EventBus.on(SystemEvents.USER_LOGIN, (payload: unknown) => {
        const { tenantSlug } = payload as { role?: string; tenantSlug?: string | null };
        useAuthStore.getState().setSelectedTenantSlug(tenantSlug ?? null);
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_NAVIGATE_TENANT, (payload: unknown) => {
        const { tenantSlug } = payload as { tenantSlug: string };
        initDb(tenantSlug);
        useAuthStore.getState().setSelectedTenantSlug(tenantSlug);
        navigate('/dashboard');
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_EXIT_TENANT, () => {
        destroyDb();
        useAuthStore.getState().setSelectedTenantSlug(null);
        navigate('/admin');
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.USER_LOGOUT, () => {
        useAuthStore.getState().clearSession();
      }),
    );

    return () => subs.forEach((s) => EventBus.off(s));
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<AuthRedirect />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <ErrorBoundary moduleName="Admin Panel">
              <AdminPanelPage />
            </ErrorBoundary>
          </AdminRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

const App = () => {
  const { isLoading } = useAuth();
  const error = useAuthStore((s) => s.error);
  const session = useAuthStore((s) => s.session);
  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (authStatus === 'authenticated' && session?.role !== 'admin') {
      sessionGuard.startHeartbeat();
    } else {
      sessionGuard.stopHeartbeat();
    }
    return () => sessionGuard.stopHeartbeat();
  }, [authStatus, session?.role]);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
};

export default App;
