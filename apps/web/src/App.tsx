import { useAuth } from './common/hooks/useAuth';
import { useAuthStore } from './stores/authStore';

function LoginPrompt() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-primary">LogisCore ERP</h1>
      <p className="text-slate-600">Inicia sesión para continuar</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      <p className="text-slate-500">Cargando...</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center gap-4">
      <div className="alert-error max-w-md">
        <span>{message}</span>
      </div>
    </div>
  );
}

function Dashboard() {
  const session = useAuthStore((s) => s.session);

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-primary">LogisCore ERP</h1>
      <div className="card max-w-md w-full text-center space-y-2">
        <p className="text-sm text-slate-500">
          Bienvenido, <strong>{session?.email}</strong>
        </p>
        {session?.tenantSlug && (
          <p className="text-xs text-slate-400">Tenant: {session.tenantSlug}</p>
        )}
        {session?.role && <span className="badge bg-accent text-white">{session.role}</span>}
      </div>
    </div>
  );
}

const App = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const error = useAuthStore((s) => s.error);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!isAuthenticated) return <LoginPrompt />;

  return <Dashboard />;
};

export default App;
