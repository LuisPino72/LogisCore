import { type FC, type ReactNode } from 'react';
import { LogOut, Menu as MenuIcon } from 'lucide-react';
import { Button } from './Button';

export interface SidebarModule {
  id: string;
  label: string;
  icon: ReactNode;
  enabled?: boolean;
}

interface SidebarProps {
  isOpen: boolean;
  expanded?: boolean; // collapsed (false) by default on mobile
  onToggleExpanded?: (expanded: boolean) => void;
  onClose: () => void;
  modules: SidebarModule[];
  activeModule: string;
  onNavigate: (moduleId: string) => void;
  userEmail: string;
  onLogout?: () => void;
  footerSlot?: ReactNode;
}

export const Sidebar: FC<SidebarProps> = ({
  isOpen,
  expanded = false,
  onToggleExpanded,
  onClose: _onClose,
  modules,
  activeModule,
  onNavigate,
  userEmail,
  onLogout,
  footerSlot,
}) => {
  return (
    <>
      {/* Backdrop when expanded on mobile */}
      {expanded && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => onToggleExpanded?.(false)} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200
          flex flex-col
          transform transition-all duration-300 ease-in-out
          ${expanded ? 'w-48' : 'w-14'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-expanded={expanded}
        id="app-sidebar"
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-gray-100 shrink-0">
          {/* Header layout:
              - Collapsed: center the existing hamburger button (no extra icon)
              - Expanded: show emblem + app name and keep hamburger on the right */}
          {!expanded ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleExpanded?.(!expanded)}
                  aria-label={expanded ? 'Cerrar sidebar' : 'Abrir sidebar'}
                  aria-controls="app-sidebar"
                  title={expanded ? 'Cerrar sidebar' : 'Abrir sidebar'}
                >
                  <MenuIcon size={16} />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <img src="/Emblema.ico" alt="Emblema" className="h-5 w-5" />
              <span className="font-title font-bold text-sm text-gray-900">LogisCore</span>

              <div className="ml-auto md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleExpanded?.(!expanded)}
                  aria-label={expanded ? 'Cerrar sidebar' : 'Abrir sidebar'}
                  aria-controls="app-sidebar"
                  title={expanded ? 'Cerrar sidebar' : 'Abrir sidebar'}
                >
                  <MenuIcon size={16} />
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="py-2 flex flex-col items-stretch">
            {modules.map((mod) => (
              <Button
                key={mod.id}
                variant="ghost"
                className={`flex items-center ${expanded ? 'w-full rounded-none px-3 py-2 text-sm justify-start gap-2 font-normal' : 'w-full p-2 justify-center'} ${
                  activeModule === mod.id
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-l-primary'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  onNavigate(mod.id);
                  // do not auto-close when collapsed/persistent
                }}
                title={!expanded ? mod.label : undefined}
              >
                <span className="w-5 inline-flex justify-center shrink-0">
                  {mod.icon}
                </span>
                {expanded && <span>{mod.label}</span>}
              </Button>
            ))}
          </nav>
          {footerSlot && expanded && (
            <div className="px-3 py-3 border-t border-gray-100 bg-white">
              {footerSlot}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 shrink-0 bg-gray-50/30">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <div className="w-5 inline-flex justify-center shrink-0">
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                {(userEmail || 'U')[0].toUpperCase()}
              </span>
            </div>
            {expanded && <span className="text-xs font-medium text-gray-700 truncate flex-1">{userEmail || 'Usuario'}</span>}
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-danger hover:bg-red-50 transition-colors group"
            onClick={onLogout}
            title={!expanded ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={14} className="group-hover:text-danger" />
            {expanded && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
