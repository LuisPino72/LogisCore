import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/hooks/useAuth';
import { useAuthStore } from './features/auth/stores/authStore';
import { authService } from './features/auth/services/authService';
import { sessionGuard } from './features/auth/services/sessionGuardService';
import { hasPermission } from './features/auth/permissions/rolePermissions';
import type { UserRole } from './features/auth/types';
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
  Receipt,
  DollarSign,
  ChefHat,
  Users,
} from 'lucide-react';
import { LoginPage } from './features/auth/components/LoginPage';
import { AdminPanelPage } from './features/admin/components/AdminPanelPage';
import { ExchangeRateWidget } from './features/exchange/components/ExchangeRateWidget';
import { useExchangeRateStore } from './features/exchange/stores/exchangeRateStore';
import { NotificationBell } from './common/components/NotificationBell';
import { useSystemNotifications } from './features/system/hooks/useSystemNotifications';

const DashboardPage = lazy(() =>
  import('./features/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const InventoryPage = lazy(() =>
  import('./features/inventory').then((m) => ({ default: m.InventoryPage })),
);
const PosPage = lazy(() => import('./features/pos').then((m) => ({ default: m.PosPage })));
const PurchasePage = lazy(() =>
  import('./features/purchases').then((m) => ({ default: m.PurchasePage })),
);
const ReportsPage = lazy(() =>
  import('./features/reports').then((m) => ({ default: m.ReportsPage })),
);
const GastosPage = lazy(() => import('./features/gastos').then((m) => ({ default: m.GastosPage })));
const ProductionPage = lazy(() =>
  import('./features/production').then((m) => ({ default: m.ProductionPage })),
);
const CustomersPage = lazy(() =>
  import('./features/customers').then((m) => ({ default: m.CustomersPage })),
);

const ALL_MODULES: SidebarModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'inventory', label: 'Inventario', icon: <Package size={20} /> },
  { id: 'pos', label: 'POS', icon: <ShoppingCart size={20} /> },
  { id: 'purchases', label: 'Compras', icon: <Truck size={20} /> },
  { id: 'production', label: 'Producción', icon: <ChefHat size={20} /> },
  { id: 'gastos', label: 'Gastos', icon: <Receipt size={20} /> },
  { id: 'customers', label: 'Clientes', icon: <Users size={20} /> },
  { id: 'reports', label: 'Reportes', icon: <FileText size={20} /> },
];

// BACKLOG-106 [AUTH-002]: Lookup dinámico desde rolePermissions (single source of truth)
// Antes era un Set hardcoded; ahora se filtra por `getRolePermissions(role).modules` (ver sidebarModules más abajo).

const MODULE_ROUTE_MAP: Record<string, string> = {
  dashboard: '/dashboard',
  inventory: '/inventory',
  production: '/production',
  gastos: '/gastos',
  purchases: '/purchases',
  pos: '/pos',
  customers: '/customers',
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
        <Button
          variant="primary"
          fullWidth
          className="mt-4"
          onClick={() => window.location.reload()}
        >
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
  if (path.startsWith('/production')) return 'production';
  if (path.startsWith('/gastos')) return 'gastos';
  if (path.startsWith('/purchases')) return 'purchases';
  if (path.startsWith('/pos')) return 'pos';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/reports')) return 'reports';
  return 'dashboard';
}

function RateBadgeMobile() {
  const rate = useExchangeRateStore((s) => s.rate);
  const fetchedAt = useExchangeRateStore((s) => s.fetchedAt);
  const loading = useExchangeRateStore((s) => s.loading);

  // Calcular estado para color y mensaje
  const isMissing = !rate;
  const ageMs = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Infinity;
  const isStale = ageMs > 24 * 60 * 60 * 1000;
  const isCritical = ageMs > 48 * 60 * 60 * 1000;

  let colorClass = 'bg-success/10 border-success/20 text-success';
  let textClass = 'text-success/70';
  let displayValue: string;
  let title: string;

  if (isMissing) {
    colorClass = 'bg-danger/10 border-danger/30 text-danger';
    textClass = 'text-danger/70';
    displayValue = loading ? '...' : '—';
    title = loading ? 'Cargando tasa...' : 'Sin tasa — toca para ir a Configuración';
  } else if (isCritical) {
    colorClass = 'bg-danger/10 border-danger/30 text-danger';
    textClass = 'text-danger/70';
    displayValue = rate.toFixed(2);
    title = 'Tasa muy desactualizada (>48h)';
  } else if (isStale) {
    colorClass = 'bg-warning/10 border-warning/30 text-warning';
    textClass = 'text-warning/70';
    displayValue = rate.toFixed(2);
    title = 'Tasa desactualizada (>24h)';
  } else {
    displayValue = rate.toFixed(2);
    title = 'Tasa BCV';
  }

  return (
    <div
      className={`md:hidden flex items-center gap-1.5 px-2 py-0.5 border rounded-full shadow-sm shrink-0 ${colorClass} ${
        isMissing || isCritical ? 'animate-pulse' : ''
      }`}
      title={title}
    >
      <DollarSign size={12} className="shrink-0" />
      <span className={`text-[11px] font-medium whitespace-nowrap ${textClass}`}>Tasa Bs</span>
      <span className="text-xs font-bold whitespace-nowrap">{displayValue}</span>
    </div>
  );
}

function DashboardLayout() {
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useAuthStore((s) => s.selectedTenantSlug);
  const navigate = useNavigate();
  const location = useLocation();
  const activeModule = useSyncModuleFromRoute();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );

  const isAdmin = session?.role === 'admin';
  const isAdminViewingTenant = isAdmin && selectedTenantSlug !== null;
  const role = session?.role ?? null;

  const knownModulePaths = [
    '/dashboard',
    '/inventory',
    '/production',
    '/gastos',
    '/purchases',
    '/pos',
    '/customers',
    '/reports',
  ];
  const isKnownModulePath = knownModulePaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  );

  const effectiveTenantId = useTenantResolution({
    session,
    selectedTenantSlug,
    isAdminViewingTenant,
  });

  useSystemNotifications(effectiveTenantId, role);

  useEffect(() => {
    document.documentElement.dataset.sidebarExpanded = String(sidebarExpanded);
  }, [sidebarExpanded]);

  const handleNavigate = useCallback(
    (moduleId: string) => {
      const route = MODULE_ROUTE_MAP[moduleId] ?? '/dashboard';
      navigate(route);
    },
    [navigate],
  );

  const handleLogout = useCallback(async () => {
    const result = await authService.signOut();
    if (!result.ok) {
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  if (!isKnownModulePath) {
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;
  }

  // BACKLOG-106 [AUTH-002]: Filtrar sidebar por permisos del rol (lectura síncrona).
  const sidebarModules =
    role === 'employee' ? ALL_MODULES.filter((m) => hasPermission(session, m.id)) : ALL_MODULES;

  return (
    <>
      <AppShell
        topBar={
          <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 h-full overflow-hidden">
            {isAdminViewingTenant && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => EventBus.emit(SystemEvents.ADMIN_EXIT_TENANT)}
                className="active:scale-95 transition-transform shrink-0"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Volver al Panel</span>
              </Button>
            )}
            <div
              className="flex items-center gap-2 bg-primary/10 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer active:scale-95 shrink-0"
              onClick={() => handleNavigate('dashboard')}
            >
              <Store size={20} className="text-primary shrink-0" />
              <span className="font-title font-semibold text-sm text-primary">Sasa</span>
            </div>
            <div className="flex-1 min-w-0" />
            {role && (
              <Badge
                variant="success"
                className="hidden! sm:inline-flex! active:scale-95 cursor-pointer transition-transform"
              >
                {role === 'owner' ? 'Dueño' : role === 'employee' ? 'Empleado' : role}
              </Badge>
            )}
            {effectiveTenantId && <RateBadgeMobile />}
          </div>
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
          {activeModule === 'dashboard' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <DashboardPage tenantId={effectiveTenantId} userEmail={session?.email} />
              </Suspense>
            </div>
          )}
          {activeModule === 'inventory' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <InventoryPage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
          {activeModule === 'production' && (
            <div className="animate-fade-in">
              <ErrorBoundary moduleName="Producción">
                <Suspense fallback={<ModuleSkeleton />}>
                  <ProductionPage tenantId={effectiveTenantId} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {activeModule === 'gastos' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <GastosPage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
          {activeModule === 'purchases' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <PurchasePage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
          {activeModule === 'pos' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <PosPage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
          {activeModule === 'customers' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <CustomersPage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
          {activeModule === 'reports' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <ReportsPage tenantId={effectiveTenantId} />
              </Suspense>
            </div>
          )}
        </ErrorBoundary>
      </AppShell>

      {role && role !== 'employee' && (
        <div className="fixed top-2 right-2 sm:top-3 sm:right-3 z-50">
          <NotificationBell />
        </div>
      )}
    </>
  );
}

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const session = useAuthStore((s) => s.session);
  const selectedTenantSlug = useAuthStore((s) => s.selectedTenantSlug);
  const role = session?.role;

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (role === 'admin' && !selectedTenantSlug) {
    return <Navigate to="/admin" replace />;
  }

  // BACKLOG-106 [AUTH-002]: Defense in depth — si la ruta declara allowedRoles y el rol no aplica, redirect.
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const role = useAuthStore((s) => s.session?.role);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // BACKLOG-106 [AUTH-002]: Fix bug — employee iba a /inventory (no en su sidebar). Ahora va a /pos.
  if (role !== 'admin')
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;

  return <>{children}</>;
}

function AuthRedirect() {
  const { isAuthenticated } = useAuth();
  const role = useAuthStore((s) => s.session?.role);

  if (isAuthenticated) {
    return (
      <Navigate
        to={role === 'admin' ? '/admin' : role === 'employee' ? '/pos' : '/dashboard'}
        replace
      />
    );
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
