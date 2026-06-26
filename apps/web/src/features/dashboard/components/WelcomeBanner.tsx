import { type FC, useMemo } from 'react';
import { Sun, Sunset, Moon, Calendar, AlertTriangle, CheckCircle, Store } from 'lucide-react';
import { startOfDayVzla } from '@/lib/date';
import { formatUsd } from '../../../lib/formatBs';
import type { SubscriptionResponse } from '../types';

interface WelcomeBannerProps {
  userName: string;
  tenantName: string | null;
  logoUrl?: string | null;
  subscription?: SubscriptionResponse | null;
  todayEarnings?: number | null;
  todayEarningsLoading?: boolean;
  onEarningsClick?: () => void;
}

function getGreeting(): { text: string; icon: FC<{ size?: number; className?: string }> } {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return { text: 'Buenos días', icon: Sun };
  if (hour >= 12 && hour < 19) return { text: 'Buenas tardes', icon: Sunset };
  return { text: 'Buenas noches', icon: Moon };
}

export const WelcomeBanner: FC<WelcomeBannerProps> = ({ tenantName, logoUrl, subscription, todayEarnings, todayEarningsLoading, onEarningsClick }) => {
  const dateKey = new Date().toDateString();

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [dateKey],
  );

  const greeting = useMemo(() => getGreeting(), [dateKey]);

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

  const isUrgent = expiryUrgency === 'critical' || expiryUrgency === 'expired';

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

      <div className="relative p-5 sm:p-6 welcome-stagger">
        <div className="flex items-start gap-3">
          {/* Logo del negocio */}
          {logoUrl ? (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-white/80 flex items-center justify-center ring-2 ring-accent/20 shadow-sm shrink-0 dashboard-logo-shine">
              <img
                src={logoUrl}
                alt={`Logo de ${tenantName}`}
                className="w-full h-full object-contain p-1"
              />
            </div>
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-accent/15 flex items-center justify-center ring-2 ring-accent/20 shadow-sm shrink-0">
              <Store size={24} className="text-accent-dark sm:hidden" />
              <Store size={28} className="text-accent-dark hidden sm:block" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] sm:text-xs font-semibold text-accent-dark uppercase tracking-wider">
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
            <p className="text-sm sm:text-base text-gray-800 mt-0.5 capitalize font-medium">{today}</p>
          </div>

          {/* Ganancia del día */}
          <div className="shrink-0 text-right hidden sm:block">
            {todayEarningsLoading ? (
              <div className="skeleton h-5 w-20 rounded ml-auto" />
            ) : todayEarnings != null && todayEarnings > 0 ? (
              <button
                type="button"
                onClick={onEarningsClick}
                className="group"
              >
                <p className="text-[14px] font-medium uppercase tracking-wider">Ganancia de hoy</p>
                <p className="text-md font-title font-bold text-success group-hover:text-success/80 transition-colors">
                  {formatUsd(todayEarnings)}
                </p>
                <p className="text-[14px] font-medium uppercase tracking-wider ">Ver reportes →</p>
              </button>
            ) : (
              <button
                type="button"
                onClick={onEarningsClick}
                className="group"
              >
                <p className="text-[14px] font-medium uppercase tracking-wider">Ganancia de hoy</p>
                <p className="text-md font-title font-bold text-gray-400 group-hover:text-gray-500 transition-colors">
                  Sin ventas
                </p>
                <p className="text-[14px] font-medium uppercase tracking-wider ">Ver reportes →</p>
              </button>
            )}
          </div>
        </div>

        {/* Ganancia del día — mobile */}
        <div className="sm:hidden mt-3 pt-3 border-t border-amber-200/40">
          {todayEarningsLoading ? (
            <div className="skeleton h-5 w-20 rounded mx-auto" />
          ) : todayEarnings != null && todayEarnings > 0 ? (
            <button
              type="button"
              onClick={onEarningsClick}
              className="flex flex-col items-center w-full group"
            >
              <span className="text-[12px]  uppercase tracking-wider">Ganancia de hoy</span>
              <span className="text-base font-title font-bold text-success group-hover:text-success/80 transition-colors">
                {formatUsd(todayEarnings)}
              </span>
              <span className="text-[12px] transition-colors">Ver reportes →</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onEarningsClick}
              className="flex flex-col items-center w-full group"
            >
              <span className="text-[12px] suppercase tracking-wider">Ganancia de hoy</span>
              <span className="text-base font-title font-bold text-gray-400 group-hover:text-gray-500 transition-colors">
                Sin ventas
              </span>
              <span className="text-[12px] transition-colors">Ver reportes →</span>
            </button>
          )}
        </div>
      </div>

      {daysRemaining !== null && expiryUrgency !== 'ok' && (
        <div className={`mx-5 sm:mx-6 mb-5 px-3.5 py-2.5 rounded-lg flex items-center gap-2 text-xs font-medium ${
          expiryUrgency === 'expired'
            ? 'bg-danger/10 text-danger border border-danger/20'
            : 'bg-warning/10 text-warning border border-warning/20'
        } ${isUrgent ? 'urgent-pulse' : ''}`}>
          {expiryUrgency === 'expired'
            ? <AlertTriangle size={14} className="shrink-0" />
            : <Calendar size={14} className="shrink-0" />
          }
          <span className="flex-1">
            {expiryUrgency === 'expired'
              ? 'Suscripción vencida — Llama al 0414-518-0265'
              : `Suscripción vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}. Contacta al 0414-518-0265 para renovar.`
            }
          </span>
        </div>
      )}
    </div>
  );
};
