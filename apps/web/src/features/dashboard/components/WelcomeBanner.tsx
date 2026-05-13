import { FC } from 'react';
import { Store } from 'lucide-react';

interface WelcomeBannerProps {
  userName: string;
  tenantName: string | null;
}

export const WelcomeBanner: FC<WelcomeBannerProps> = ({ userName, tenantName }) => {
  const name = userName.split('@')[0] ?? userName;
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-amber-50 to-orange-100 border border-amber-200 p-5">
      <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/5 rounded-full translate-y-1/2 -translate-x-1/4" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Store size={20} className="text-accent-dark" />
          <span className="text-xs font-medium text-accent-dark uppercase tracking-wider">
            {tenantName ?? 'Cargando...'}
          </span>
        </div>
        <h1 className="text-xl font-title font-bold text-gray-900 mt-1 truncate">
          ¡Hola, {name}!
        </h1>
        <p className="text-sm text-gray-600 mt-0.5 capitalize">{today}</p>
      </div>
    </div>
  );
};
