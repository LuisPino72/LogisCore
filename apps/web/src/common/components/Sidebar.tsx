import { memo, type ReactNode } from 'react';
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
  expanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  onClose: () => void;
  modules: SidebarModule[];
  activeModule: string;
  onNavigate: (moduleId: string) => void;
  userEmail: string;
  onLogout?: () => void;
  footerSlot?: ReactNode;
}

export const Sidebar = memo(function Sidebar(props: SidebarProps) {
  const { isOpen, expanded = false, onToggleExpanded, modules, activeModule, onNavigate, userEmail, onLogout, footerSlot } = props;
  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in md:hidden" onClick={() => onToggleExpanded?.(false)} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200
          flex flex-col h-dvh
          transform transition-[width,transform] duration-300 ease-in-out
          ${expanded ? 'w-48' : 'w-10'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-expanded={expanded}
        id="app-sidebar"
      >
        <div className="flex items-center h-12 border-b border-gray-100 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-3 w-full">
            <img src="/Emblema.ico" alt="Emblema" className="h-5 w-5" />
            <span className="font-title font-bold text-sm text-gray-900">LogisCore</span>
          </div>

          <div className="md:hidden flex items-center justify-center w-full h-full">
            {!expanded ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleExpanded?.(true)}
                aria-label="Abrir sidebar"
                aria-controls="app-sidebar"
                title="Abrir sidebar"
              >
                <MenuIcon size={16} />
              </Button>
            ) : (
              <div className="flex items-center gap-2 px-3 w-full h-full">
                <img src="/Emblema.ico" alt="Emblema" className="h-5 w-5" />
                <span className="font-title font-bold text-sm text-gray-900">LogisCore</span>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleExpanded?.(false)}
                    aria-label="Cerrar sidebar"
                    aria-controls="app-sidebar"
                    title="Cerrar sidebar"
                  >
                    <MenuIcon size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <nav className="py-2 flex flex-col items-stretch">
            {modules.map((mod) => {
              const isActive = activeModule === mod.id;
              return (
                <Button
                  key={mod.id}
                  variant="ghost"
                  className={`relative flex items-center ${
                    expanded
                      ? 'w-full rounded-none px-3 py-2 text-sm justify-start gap-2 font-normal'
                      : 'w-full p-1 justify-center md:w-full md:rounded-none md:px-3 md:py-2 md:text-sm md:justify-start md:gap-2 md:font-normal'
                  } ${
                    isActive
                      ? expanded
                        ? 'bg-primary/20 text-primary font-semibold rounded-lg ring-1 ring-primary/30'
                        : 'text-primary md:bg-primary/25 md:rounded-lg md:font-semibold md:ring-2 md:ring-primary/40'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => {
                    onNavigate(mod.id);
                    if (window.innerWidth < 768) {
                      onToggleExpanded?.(false);
                    }
                  }}
                  title={!expanded ? mod.label : undefined}
                >
                  {isActive && (
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-full bg-primary ${expanded ? '' : 'hidden md:block'}`} aria-hidden />
                  )}

                  <span className={`w-5 inline-flex justify-center items-center shrink-0 ${isActive && !expanded ? 'h-5 rounded-full bg-primary/30 ring-2 ring-primary/40' : ''}`}>
                    {mod.icon}
                  </span>
                  <span className={!expanded ? 'hidden md:inline' : ''}>{mod.label}</span>
                </Button>
              );
            })}
          </nav>
          {footerSlot && (
            <div className={`px-3 py-3 border-t border-gray-100 bg-white ${expanded ? '' : 'hidden md:block'}`}>
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
            <span className={`text-xs font-medium text-gray-700 truncate flex-1 ${expanded ? '' : 'hidden md:block'}`}>
              {userEmail || 'Usuario'}
            </span>
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] md:min-h-0 text-xs text-gray-500 hover:text-danger hover:bg-red-50 transition-colors group"
            onClick={onLogout}
            title={!expanded ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={14} className="group-hover:text-danger shrink-0" />
            <span className={!expanded ? 'hidden md:inline' : ''}>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
});
