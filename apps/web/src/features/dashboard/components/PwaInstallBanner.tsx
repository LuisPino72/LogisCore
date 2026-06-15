import { type FC, useState } from 'react';
import { Download, X, Smartphone, Share } from 'lucide-react';
import { usePwaInstall } from '../../../hooks/usePwaInstall';

export const PwaInstallBanner: FC = () => {
  const { isInstallable, dismissed, install, dismiss, showInstructions } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) return null;

  // Don't render if installed, dismissed, or no way to install
  if (dismissed || (!isInstallable && !showInstructions)) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-teal-50 via-teal-50/80 to-emerald-100 border border-teal-200/60 animate-slide-up">
      {/* Decorative dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(20,184,166,0.3) 1px, transparent 0)',
          backgroundSize: '50px 50px',
        }}
      />
      <div className="absolute -top-6 -right-6 w-28 h-28 bg-teal-300/8 rounded-full blur-2xl" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-emerald-300/5 rounded-full blur-xl" />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0 shadow-sm">
            <Download size={20} className="text-teal-600" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Descarga Sasa ERP en tu dispositivo
            </p>

            {isInstallable ? (
              <p className="text-xs text-gray-600 mt-0.5">
                Instálala como una app nativa para acceso rápido y uso sin conexión.
              </p>
            ) : (
              /* iOS / Safari fallback instructions */
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-gray-600">
                  Toca el botón de <strong>compartir</strong> y luego <strong>"Añadir a pantalla de inicio"</strong>:
                </p>
                <div className="flex items-center gap-2 text-xs text-teal-700">
                  <Share size={12} className="shrink-0" />
                  <span className="flex items-center gap-1">
                    Compartir <span className="text-gray-400">→</span> Añadir a pantalla de inicio
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 p-1 rounded-lg hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Ocultar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Install button - only show when browser supports it */}
        {isInstallable && (
          <div className="mt-3 ml-[52px]">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 active:bg-teal-800 transition-all duration-200 shadow-sm disabled:opacity-60"
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
