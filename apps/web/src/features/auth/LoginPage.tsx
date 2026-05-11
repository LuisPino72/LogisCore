import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Alert, Card } from '@/common/components';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { isLoggingIn, loginError, fieldErrors, login, clearLoginError } = useAuthStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearLoginError();
    login(email, password);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="w-full max-w-md animate-slide-up flex flex-col items-center gap-8">
        
        {/* Header Section */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 blur-3xl rounded-full scale-150 bg-primary/20" />
            <img 
              src="/Emblema.ico" 
              alt="LogisCore Logo" 
              className="relative w-20 h-20 rounded-2xl shadow-sm bg-white"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight font-title text-primary">
              LogisCore <span className="text-accent">ERP</span>
            </h1>
            <p className="text-sm font-medium text-text-secondary">
              Gestión inteligente para tu negocio
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="w-full p-8 shadow-xl border-border-light">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="space-y-4">
              <Input
                label="Correo electrónico"
                type="email"
                placeholder="nombre@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                iconLeft={<Mail size={18} />}
                error={fieldErrors.email}
                autoComplete="email"
              />

              <div className="flex flex-col gap-1.5">
                <Input
                  label="Contraseña"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  iconLeft={<Lock size={18} />}
                  error={fieldErrors.password}
                  autoComplete="current-password"
                  iconRight={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-text-muted hover:text-text-secondary transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />
              </div>
            </div>

            {loginError && (
              <Alert variant="error" className="animate-slide-down">
                <span className="font-medium">{loginError}</span>
              </Alert>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
              fullWidth
              loading={isLoggingIn}
              className="shadow-lg"
            >
              {isLoggingIn ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>
        </Card>

        {/* Footer */}
        <p className="text-xs text-center text-text-muted leading-relaxed">
          &copy; {new Date().getFullYear()} LogisCore ERP
        </p>
      </div>
    </div>
  );
}
