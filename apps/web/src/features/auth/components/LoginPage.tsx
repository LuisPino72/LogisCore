import { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Alert } from '../../../common/components';
import { useAuthStore } from '../stores/authStore';

const REMEMBERED_EMAIL_KEY = 'logiscore-remembered-email';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [alertKey, setAlertKey] = useState(0);

  const { login, isLoggingIn, loginError, fieldErrors, clearLoginError } = useAuthStore();

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (loginError) setAlertKey((k) => k + 1);
  }, [loginError]);

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
    <div className="min-h-screen bg-linear-to-br from-primary via-primary-dark to-[#064E4B] flex items-center justify-center p-3 sm:p-5 relative overflow-hidden">
      {/* Animated mesh gradient orbs */}
      <div className="absolute top-1/4 -left-24 w-80 h-80 bg-accent/10 rounded-full blur-3xl login-orb max-sm:w-48 max-sm:h-48" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 bg-primary-light/10 rounded-full blur-3xl login-orb-2 max-sm:w-48 max-sm:h-48" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-accent/5 rounded-full blur-3xl login-orb-3 max-sm:hidden" />
      <div className="absolute bottom-1/3 left-1/4 w-56 h-56 border border-white/5 rounded-full" />

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

      {/* Glassmorphism Card */}
      <div
        className="w-full max-w-sm sm:max-w-md animate-slide-up relative z-10"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(13, 148, 136, 0.15)',
          borderRadius: '1.25rem',
          padding: 'clamp(1rem, 4vw, 2rem)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(13, 148, 136, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        }}
      >
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-linear-to-br from-primary/20 to-accent/10 blur-xl" />
            <div
              className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.1) 0%, rgba(245, 158, 11, 0.06) 100%)',
                border: '1px solid rgba(13, 148, 136, 0.2)',
                animation: 'logoFloat 3s ease-in-out infinite',
              }}
            >
              {logoError ? (
                <span className="text-2xl sm:text-3xl font-bold text-primary select-none">S</span>
              ) : (
                <img
                  src="/Sasa con fondo.png"
                  alt="Sasa"
                  className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                  onError={() => setLogoError(true)}
                />
              )}
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-title font-bold text-primary tracking-tight">Sasa</h1>
            <p className="text-xs sm:text-sm text-gray-800 mt-1 font-sans">Bienvenido de vuelta. Ingresa a tu cuenta.</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="correo@negocio.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearLoginError(); }}
            error={fieldErrors.email}
            iconLeft={<Mail size={18} className="text-gray-400" />}
            autoComplete="email"
            autoFocus
            inputClassName="input-glow"
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
            showPassword
            inputClassName="input-glow"
          />

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="checkbox-login"
              />
              <span className="text-sm text-gray-800 group-hover:text-gray-800 transition-colors">Recordarme</span>
            </label>
          </div>

          {loginError && (
            <div className="alert-animate" key={alertKey}>
              <Alert variant="error">{loginError}</Alert>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isLoggingIn}
            className="btn-glow-hover py-2.5 sm:py-3 text-sm sm:text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
            }}
          >
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
