import { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Alert, Card, Checkbox } from '../../../common/components';
import { useAuthStore } from '../stores/authStore';

const REMEMBERED_EMAIL_KEY = 'logiscore-remembered-email';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-surface to-accent/5 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full animate-slide-up">
        <div className="flex flex-col items-center gap-2 mb-6">
          <img
            src="/Emblema.ico"
            alt="LogisCore"
            className="w-16 h-16"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 className="text-xl font-title font-bold text-primary">LogisCore</h1>
          <p className="text-sm text-gray-500">Inicia sesión para continuar</p>
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
            maxLength={30}
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
            maxLength={30}
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
