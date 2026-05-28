import { type FC } from 'react';
import { Sun, Sunset, Moon, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { startOfDayVzla } from '@/lib/date';
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

export const WelcomeBanner: FC<WelcomeBannerProps> = ({ tenantName, subscription }) => {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  const daysRemaining = subscription?.expires_at
    ? Math.round((new Date(startOfDayVzla(new Date(subscription.expires_at))).getTime() - new Date(startOfDayVzla()).getTime()) / 86400000)
    : null;

  const expiryUrgency = daysRemaining !== null && daysRemaining <= 0
    ? 'expired'
    : daysRemaining !== null && daysRemaining <= 3
      ? 'critical'
      : daysRemaining !== null && daysRemaining <= 7
        ? 'warning'
        : 'ok';

  return (
    <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-amber-50 via-amber-50/80 to-orange-100 border border-amber-200/60 animate-slide-up">
      {/* Decorative dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(245,158,11,0.3) 1px, transparent 0)',
          backgroundSize: '50px 50px',
        }}
      />
      <div className="absolute -top-6 -right-6 w-28 h-28 bg-accent/8 rounded-full blur-2xl" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-accent/5 rounded-full blur-xl" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 shadow-sm">
            <GreetingIcon size={20} className="text-accent-dark" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-accent-dark uppercase tracking-wider">
                {tenantName ?? 'Cargando...'}
              </span>
              {daysRemaining !== null && expiryUrgency === 'ok' && daysRemaining > 7 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100/70 border border-teal-200/50 text-[10px] font-medium text-teal-700">
                  <CheckCircle size={10} />
                  Quedan {daysRemaining} días
                </span>
              )}
            </div>
            <p className="text-xs text-accent-dark mt-0.5">{greeting.text}</p>
          </div>
        </div>
        <p className="text-sm text-gray-800 mt-0.5 capitalize">{today}</p>
      </div>

      {daysRemaining !== null && expiryUrgency !== 'ok' && (
        <div className={`mx-5 sm:mx-6 mb-5 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-xs font-medium ${
          expiryUrgency === 'expired'
            ? 'bg-danger/10 text-danger border border-danger/20'
            : 'bg-warning/10 text-warning border border-warning/20'
        }`}>
          {expiryUrgency === 'expired'
            ? <AlertTriangle size={14} className="shrink-0" />
            : <Calendar size={14} className="shrink-0" />
          }
          <span className="flex-1">
            {expiryUrgency === 'expired'
              ? 'Suscripción vencida — contacta al 04145180265'
              : `Suscripción vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}`
            }
          </span>
        </div>
      )}
    </div>
  );
};
