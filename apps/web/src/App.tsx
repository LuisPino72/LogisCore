import { useCallback, useEffect, useState, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/hooks/useAuth';
import { useAuthStore } from './features/auth/stores/authStore';
import { authService } from './features/auth/services/authService';
import { sessionGuard } from './features/auth/services/sessionGuardService';
import { hasPermission } from './features/auth/permissions/rolePermissions';
import type { UserRole } from './features/auth/types';
import { EventBus, SystemEvents } from '@logiscore/core';
import { initDb, destroyDb } from './services/dexie/db';
import { TenantTranslator } from './services/tenantTranslator';
import { useTenantResolution } from './features/dashboard/hooks/useTenantResolution';
import { logger } from './lib/logger';
import { AppShell } from './common/components/AppShell';
import { Badge } from './common/components/Badge';
import { Button } from './common/components/Button';
import { Card } from './common/components/Card';
import { Spinner } from './common/components/Loading';
import { ModuleSkeleton } from './common/components/ModuleSkeleton';
import { ToastContainer } from './common/components/Toast';
import { Sidebar } from './common/components/Sidebar';
import { ErrorBoundary } from './common/components/ErrorBoundary';
import type { SidebarModule } from './common/components/Sidebar';
import { OfflineBanner } from './common/components/OfflineBanner';
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
  Settings,
} from 'lucide-react';
import { LoginPage } from './features/auth/components/LoginPage';
const AdminPanelPage = lazy(() => import('./features/admin/components/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })));
const ExchangeRateWidget = lazy(() => import('./features/exchange/components/ExchangeRateWidget').then((m) => ({ default: m.ExchangeRateWidget })));
import { useExchangeRateStore } from './features/exchange/stores/exchangeRateStore';
import { NotificationBell } from './common/components/NotificationBell';
import { useSystemNotifications } from './features/system/hooks/useSystemNotifications';

const DashboardPage = lazy(() =>
  import('./features/dashboard/components/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const InventoryPage = lazy(() =>
  import('./features/inventory/components/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const PosPage = lazy(() => import('./features/pos/components/PosPage').then((m) => ({ default: m.PosPage })));
const PurchasePage = lazy(() =>
  import('./features/purchases/components/PurchasePage').then((m) => ({ default: m.PurchasePage })),
);
const ReportsPage = lazy(() =>
  import('./features/reports/components/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const GastosPage = lazy(() => import('./features/gastos/components/GastosPage').then((m) => ({ default: m.GastosPage })));
const ProductionPage = lazy(() =>
  import('./features/production/pages/ProductionPage').then((m) => ({ default: m.ProductionPage })),
);
const CustomersPage = lazy(() =>
  import('./features/customers/components/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const SettingsPage = lazy(() =>
  import('./features/settings/components/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

// PERF-001: Pre-carga y prefetch de módulos
const MODULE_IMPORTS: Record<string, () => Promise<unknown>> = {
  dashboard: () => import('./features/dashboard/components/DashboardPage'),
  inventory: () => import('./features/inventory/components/InventoryPage'),
  pos: () => import('./features/pos/components/PosPage'),
  purchases: () => import('./features/purchases/components/PurchasePage'),
  gastos: () => import('./features/gastos/components/GastosPage'),
  production: () => import('./features/production/pages/ProductionPage'),
  customers: () => import('./features/customers/components/CustomersPage'),
  reports: () => import('./features/reports/components/ReportsPage'),
  settings: () => import('./features/settings/components/SettingsPage'),
};

const prefetchedModules = new Set<string>();

export function prefetchModule(moduleId: string) {
  if (prefetchedModules.has(moduleId)) return;
  const importFn = MODULE_IMPORTS[moduleId];
  if (importFn) {
    prefetchedModules.add(moduleId);
    importFn();
  }
}

async function preloadAllModules(onProgress?: (loaded: number, total: number) => void) {
  let loaded = 0;
  const entries = Object.values(MODULE_IMPORTS);
  const total = entries.length;
  await Promise.allSettled(
    entries.map(async (importFn) => {
      try { await importFn(); } catch { /* chunk load error — retry on navigate */ }
      loaded++;
      onProgress?.(loaded, total);
    }),
  );
  // Marcar todos como precargados
  Object.keys(MODULE_IMPORTS).forEach((id) => prefetchedModules.add(id));
}

const ALL_MODULES: SidebarModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'inventory', label: 'Inventario', icon: <Package size={20} /> },
  { id: 'pos', label: 'POS', icon: <ShoppingCart size={20} /> },
  { id: 'purchases', label: 'Compras', icon: <Truck size={20} /> },
  { id: 'production', label: 'Producción', icon: <ChefHat size={20} /> },
  { id: 'gastos', label: 'Gastos', icon: <Receipt size={20} /> },
  { id: 'customers', label: 'Clientes', icon: <Users size={20} /> },
  { id: 'reports', label: 'Reportes', icon: <FileText size={20} /> },
  { id: 'settings', label: 'Ajustes', icon: <Settings size={20} /> },
];

// AUTH-002: Sidebar filtrado por permissions[] del JWT — admin (sin permissions) ve todo,
// owner/employee/custom roles ven solo módulos donde tengan al menos un permiso.

const MODULE_ROUTE_MAP: Record<string, string> = {
  dashboard: '/dashboard',
  inventory: '/inventory',
  production: '/production',
  gastos: '/gastos',
  purchases: '/purchases',
  pos: '/pos',
  customers: '/customers',
  reports: '/reports',
  settings: '/settings',
};

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-gray-500 text-sm">Cargando...</p>
    </div>
  );
}

function SplashScreen({ progress }: { progress: number }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-6 animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg">
          <img src="/Sasa.png" alt="Sasa" className="h-10 w-10" />
        </div>
        <h1 className="font-title font-bold text-2xl text-primary">Sasa</h1>
        <p className="text-gray-400 text-sm">Preparando módulos...</p>
      </div>
      <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-primary to-primary-dark rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-gray-400 text-xs tabular-nums">{progress}%</p>
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

function LoggingOutScreen() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 animate-fade-in">
      <Spinner size="lg" />
      <p className="text-gray-700 text-sm">Cerrando sesión...</p>
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
  if (path.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

function RateBadgeMobile() {
  const rate = useExchangeRateStore((s) => s.rate);
  const fetchedAt = useExchangeRateStore((s) => s.fetchedAt);
  const loading = useExchangeRateStore((s) => s.loading);

  // Calcular estado para color y mensaje
  // La tasa BCV se actualiza de martes a viernes. Viernes noche → lunes noche se mantiene igual.
  const isMissing = !rate;
  const ageMs = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Infinity;
  const day = new Date().getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  const isRateValidPeriod = day === 0 || day === 1 || day === 5 || day === 6; // Vie, Sáb, Dom, Lun.
  const isStale = !isRateValidPeriod && ageMs > 24 * 60 * 60 * 1000;
  const isCritical = !isRateValidPeriod && ageMs > 48 * 60 * 60 * 1000;

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
      <span className={`text-[11px] font-medium whitespace-nowrap hidden min-[300px]:inline-flex ${textClass}`}>Tasa Bs</span>
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
    '/settings',
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
    useAuthStore.getState().setLoggingOut(true);
    const result = await authService.signOut();
    if (!result.ok) {
      useAuthStore.getState().setLoggingOut(false);
      logger.error('Auth', 'Error al cerrar sesión', result.error.message);
    }
  }, []);

  if (!isKnownModulePath) {
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;
  }

  // BACKLOG-106 [AUTH-002]: Filtrar sidebar por permisos desde JWT.
  const sidebarModules =
    session?.permissions
      ? ALL_MODULES.filter((m) => hasPermission(session, m.id))
      : ALL_MODULES;

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
                className="active:scale-[0.98] transition-transform shrink-0"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Volver al Panel</span>
              </Button>
            )}
            <div
              className="flex items-center gap-2 bg-primary/10 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer active:scale-[0.98] shrink-0"
              onClick={() => handleNavigate('dashboard')}
            >
              <Store size={20} className="text-primary shrink-0" />
              <span className="font-title font-semibold text-sm text-primary">Sasa</span>
            </div>
            <div className="flex-1 min-w-0" />
            {role && (
              <Badge
                variant="success"
                className="hidden! sm:inline-flex! active:scale-[0.98] cursor-pointer transition-transform"
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
            onPrefetch={prefetchModule}
            userEmail={session?.email ?? ''}
            onLogout={handleLogout}
              footerSlot={
                effectiveTenantId ? (
                  <Suspense fallback={null}>
                    <ExchangeRateWidget tenantId={effectiveTenantId} role={role ?? null} />
                  </Suspense>
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
          {activeModule === 'settings' && (
            <div className="animate-fade-in">
              <Suspense fallback={<ModuleSkeleton />}>
                <SettingsPage tenantId={effectiveTenantId} />
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
  const session = useAuthStore((s) => s.session);
  const role = session?.role;

  if (isAuthenticated) {
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (session?.permissions && !hasPermission(session, 'dashboard')) {
      return <Navigate to="/pos" replace />;
    }
    return <Navigate to={role === 'employee' ? '/pos' : '/dashboard'} replace />;
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
      EventBus.on(SystemEvents.ADMIN_NAVIGATE_TENANT, async (payload: unknown) => {
        const { tenantSlug } = payload as { tenantSlug: string };
        initDb(tenantSlug);
        useAuthStore.getState().setSelectedTenantSlug(tenantSlug);

        // FIX-001: Resolver slug → UUID y actualizar session.tenantId para SyncEngine
        try {
          const tenantUuid = await TenantTranslator.slugToUuid(tenantSlug);
          const currentSession = useAuthStore.getState().session;
          if (currentSession) {
            useAuthStore.getState().setSession({
              ...currentSession,
              tenantId: tenantUuid,
              tenantSlug,
            });
          }
        } catch (err) {
          logger.error('Admin', 'No se pudo resolver tenant UUID', String(err));
        }

        navigate('/dashboard');
      }),
    );

    subs.push(
      EventBus.on(SystemEvents.ADMIN_EXIT_TENANT, () => {
        destroyDb();
        useAuthStore.getState().setSelectedTenantSlug(null);

        // FIX-001: Limpiar tenantId de la sesión del admin
        const currentSession = useAuthStore.getState().session;
        if (currentSession) {
          useAuthStore.getState().setSession({
            ...currentSession,
            tenantId: null,
            tenantSlug: null,
          });
        }

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
              <Suspense fallback={<ModuleSkeleton />}>
                <AdminPanelPage />
              </Suspense>
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
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut);

  // PERF-001: Estado de precarga de módulos
  const [modulesReady, setModulesReady] = useState(false);
  const [modulesProgress, setModulesProgress] = useState(0);
  const preloadingRef = useRef(false);

  useEffect(() => {
    if (authStatus === 'authenticated' && !modulesReady && !preloadingRef.current) {
      preloadingRef.current = true;
      preloadAllModules((loaded, total) => {
        setModulesProgress(Math.round((loaded / total) * 100));
      }).then(() => setModulesReady(true));
    }
  }, [authStatus, modulesReady]);

  useEffect(() => {
    if (authStatus === 'authenticated' && session?.role !== 'admin') {
      sessionGuard.startHeartbeat();
    } else {
      sessionGuard.stopHeartbeat();
    }
    return () => sessionGuard.stopHeartbeat();
  }, [authStatus, session?.role]);

  useEffect(() => {
    const sub = EventBus.on(SystemEvents.USER_LOGOUT, () => {
      useAuthStore.getState().clearSession();
    });
    return () => EventBus.off(sub);
  }, []);

  if (isLoading) return <LoadingScreen />;
  if (isLoggingOut) return <LoggingOutScreen />;
  if (error) return <ErrorScreen message={error} />;

  // PERF-001: Mostrar splash mientras se precargan módulos
  if (authStatus === 'authenticated' && !modulesReady) {
    return <SplashScreen progress={modulesProgress} />;
  }

  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
      <OfflineBanner />
    </BrowserRouter>
  );
};

export default App;
