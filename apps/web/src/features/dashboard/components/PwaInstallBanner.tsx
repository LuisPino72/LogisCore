import { type FC, useState } from 'react';
import { Download, X, Monitor, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../../../hooks/usePwaInstall';

export const PwaInstallBanner: FC = () => {
  const { isInstallable, isInstalled, dismissed, install, dismiss, showInstructions } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  if (isInstalled) return null;
  if (dismissed || (!isInstallable && !showInstructions)) return null;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isDesktopChrome = !isMobile && !isIOS && /Chrome/i.test(navigator.userAgent) && !/Edg/i.test(navigator.userAgent);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-cyan-50 via-sky-50/80 to-blue-100 border border-cyan-200/60 animate-slide-up mt-3">
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            rgba(6, 182, 212, 0.15) 0px,
            rgba(6, 182, 212, 0.15) 1px,
            transparent 1px,
            transparent 12px
          )`,
        }}
      />
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-cyan-300/8 rounded-full blur-2xl" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-sky-300/5 rounded-full blur-xl" />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 shadow-sm pwa-icon-bounce">
            <Download size={20} className="text-cyan-600" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Descarga Sasa ERP en tu dispositivo
            </p>

            {isInstallable ? (
              <p className="text-xs text-gray-600 mt-0.5">
                Instálala como una app nativa para acceso rápido y uso sin conexión.
              </p>
            ) : isDesktopChrome ? (
              <div className="mt-1.5 space-y-1">
                <p className="text-xs text-gray-600">
                  Haz clic en el ícono de <strong>instalar</strong> en la barra de direcciones, o ve a{' '}
                  <strong>⋮ → Instalar Sasa ERP</strong>.
                </p>
                <div className="flex items-center gap-2 text-xs text-cyan-700">
                  <Monitor size={12} className="shrink-0" />
                  <span>⋮ Menú <span className="text-gray-400">→</span> Instalar Sasa ERP</span>
                </div>
              </div>
            ) : isIOS ? (
              <div className="mt-1.5 space-y-1">
                <p className="text-xs text-gray-600">
                  Toca el botón de <strong>Compartir</strong> <span className="inline-flex items-center align-middle mx-0.5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg></span> y luego <strong>"Añadir a pantalla de inicio"</strong>.
                </p>
                <div className="flex items-center gap-2 text-xs text-cyan-700">
                  <Smartphone size={12} className="shrink-0" />
                  <span>Compartir <span className="text-gray-400">→</span> Añadir a pantalla de inicio</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-600 mt-0.5">
                Instálala para acceso rápido y uso sin conexión.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 p-1 rounded-lg hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Ocultar"
          >
            <X size={16} />
          </button>
        </div>

        {isInstallable && (
          <div className="mt-3 ml-[52px]">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 active:bg-cyan-800 transition-all duration-200 shadow-sm disabled:opacity-60 pwa-btn-shimmer"
            >
              <Smartphone size={14} />
              {installing ? 'Instalando...' : 'Instalar ahora'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
