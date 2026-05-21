import { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { Button, Input, Alert, Card, Checkbox } from '../../../common/components';
import { useAuthStore } from '../stores/authStore';

const REMEMBERED_EMAIL_KEY = 'logiscore-remembered-email';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const { login, isLoggingIn, loginError, fieldErrors, clearLoginError } = useAuthStore();

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
    login(email, password);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-primary via-primary-dark to-primary flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-light rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 border border-white/20 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-100 h-100 border border-white/10 rounded-full" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <Card className="max-w-md w-full animate-slide-up shadow-2xl border-white/10 p-6 sm:p-8 relative z-10">
        <div className="flex flex-col items-center gap-3 mb-6">
          {logoError ? (
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
              <Shield size={32} className="text-white" />
            </div>
          ) : (
            <img
              src="/Sasa.png"
              alt="Sasa"
              className="w-16 h-16"
              onError={() => setLogoError(true)}
            />
          )}
          <div className="text-center">
            <h1 className="text-2xl font-title font-bold text-white">Sasa</h1>
            <p className="text-sm text-white/70 mt-1">Inicia sesión para continuar</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearLoginError(); }}
            error={fieldErrors.email}
            iconLeft={<Mail size={18} className="text-gray-400" />}
            autoComplete="email"
            autoFocus
          />

          <Input
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearLoginError(); }}
            error={fieldErrors.password}
            iconLeft={<Lock size={18} className="text-gray-400" />}
            iconRight={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            autoComplete="current-password"
          />

          <div className="flex items-center">
            <Checkbox
              label="Recordarme"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
          </div>

          {loginError && <Alert variant="error">{loginError}</Alert>}

          <Button type="submit" variant="primary" fullWidth loading={isLoggingIn}>
            Iniciar Sesión
          </Button>
        </form>
      </Card>
    </div>
  );
}
