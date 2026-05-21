import { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { Button, Input, Alert, Checkbox } from '../../../common/components';
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
    <div className="min-h-screen bg-linear-to-br from-primary via-primary-dark to-[#064E4B] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Geometric pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, rgba(255,255,255,0.12) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.12) 87.5%, rgba(255,255,255,0.12)),
            linear-gradient(150deg, rgba(255,255,255,0.12) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.12) 87.5%, rgba(255,255,255,0.12)),
            linear-gradient(30deg, rgba(255,255,255,0.12) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.12) 87.5%, rgba(255,255,255,0.12)),
            linear-gradient(150deg, rgba(255,255,255,0.12) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.12) 87.5%, rgba(255,255,255,0.12)),
            linear-gradient(60deg, rgba(245,158,11,0.1) 25%, transparent 25.5%, transparent 75%, rgba(245,158,11,0.1) 75%, rgba(245,158,11,0.1)),
            linear-gradient(60deg, rgba(245,158,11,0.1) 25%, transparent 25.5%, transparent 75%, rgba(245,158,11,0.1) 75%, rgba(245,158,11,0.1))
          `,
          backgroundSize: '80px 140px',
          backgroundPosition: '0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px',
        }}
      />

      {/* Floating accent orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-light/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-125 h-125 border border-white/5 rounded-full" />

      {/* Glassmorphism Card */}
      <div
        className="max-w-md w-full animate-slide-up relative z-10"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(245, 158, 11, 0.08) 100%)',
              border: '1px solid rgba(13, 148, 136, 0.15)',
              animation: 'logoFloat 3s ease-in-out infinite',
            }}
          >
            {logoError ? (
              <Shield size={36} className="text-primary" />
            ) : (
              <img
                src="/Sasa con fondo.png"
                alt="Sasa"
                className="w-14 h-14"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-title font-bold text-gray-900 tracking-tight">Sasa</h1>
            <p className="text-sm text-gray-500 mt-1.5 font-sans">Tu negocio, siempre bajo control</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
                className="text-gray-400 hover:text-gray-600 transition-colors"
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

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isLoggingIn}
            className="py-3 text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
            }}
          >
            Iniciar Sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
