import { type FC } from 'react';
import { Sun, Sunset, Moon, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import type { SubscriptionResponse } from '../types';

interface WelcomeBannerProps {
  userName: string;
  tenantName: string | null;
  subscription?: SubscriptionResponse | null;
}

function getGreeting(): { text: string; icon: FC<{ size?: number; className?: string }> } {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return { text: 'Buenos días', icon: Sun };
  if (hour >= 12 && hour < 19) return { text: 'Buenas tardes', icon: Sunset };
  return { text: 'Buenas noches', icon: Moon };
}

export const WelcomeBanner: FC<WelcomeBannerProps> = ({ userName, tenantName, subscription }) => {
  const name = userName.split('@')[0] ?? userName;
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  const daysRemaining = subscription?.expires_at
    ? Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  const expiryUrgency = daysRemaining !== null && daysRemaining <= 0
    ? 'expired'
    : daysRemaining !== null && daysRemaining <= 3
      ? 'critical'
      : daysRemaining !== null && daysRemaining <= 7
        ? 'warning'
        : 'ok';

  return (
    <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-amber-50 to-orange-100 border border-amber-200">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/5 rounded-full translate-y-1/2 -translate-x-1/4" />
      <div className="relative p-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <GreetingIcon size={18} className="text-accent-dark" />
          </div>
          <div>
            <span className="text-xs font-medium text-accent-dark uppercase tracking-wider">
              {tenantName ?? 'Cargando...'}
            </span>
            <p className="text-xs text-accent-dark/70">{greeting.text}</p>
          </div>
        </div>
        <h1 className="text-xl font-title font-bold text-gray-900 mt-2 truncate">
          ¡Hola, {name}!
        </h1>
        <p className="text-sm text-gray-600 mt-0.5 capitalize">{today}</p>
      </div>

      {daysRemaining !== null && expiryUrgency !== 'ok' && (
        <div className={
          `mx-4 mb-4 px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium ${
            expiryUrgency === 'expired'
              ? 'bg-danger/10 text-danger border border-danger/20'
              : 'bg-warning/10 text-warning border border-warning/20'
          }`
        }>
          {expiryUrgency === 'expired' ? (
            <AlertTriangle size={14} className="shrink-0" />
          ) : (
            <Calendar size={14} className="shrink-0" />
          )}
          <span className="flex-1">
            {expiryUrgency === 'expired'
              ? 'Suscripción vencida — contacta al 04145180265'
              : `Suscripción vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} — contacta al 04145180265`
            }
          </span>
        </div>
      )}

      {daysRemaining !== null && expiryUrgency === 'ok' && daysRemaining > 7 && (
        <div className="mx-4 mb-4 px-3 py-1.5 rounded-lg bg-teal-100/60 border border-teal-200/40 flex items-center gap-1.5 text-[11px] text-teal-700 w-fit">
          <CheckCircle size={12} />
          <span>Al día — {daysRemaining} días restantes</span>
        </div>
      )}
    </div>
  );
};
