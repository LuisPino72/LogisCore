import { memo, type ReactNode } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
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
  const { isOpen, expanded = false, onToggleExpanded, modules, activeModule, onNavigate } = props;
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
          ${expanded ? 'w-48' : 'w-14 md:w-48'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-expanded={expanded}
        id="app-sidebar"
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-gray-100 shrink-0">
          <div className="hidden md:flex items-center gap-2">
            <img src="/Emblema.ico" alt="Emblema" className="h-5 w-5" />
            <span className="font-title font-bold text-sm text-gray-900">LogisCore</span>
          </div>

          <div className="md:hidden flex-1 flex items-center">
            {!expanded ? (
              <div className="flex-1 flex items-center justify-center">
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
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <nav className="py-2 flex flex-col items-stretch">
            {modules.map((mod) => (
              <Button
                key={mod.id}
                variant="ghost"
                className={`flex items-center ${expanded ? 'w-full rounded-none px-3 py-2 text-sm justify-start gap-2 font-normal' : 'w-full p-2 justify-center md:w-full md:rounded-none md:px-3 md:py-2 md:text-sm md:justify-start md:gap-2 md:font-normal'} ${
                  activeModule === mod.id
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-l-primary'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  onNavigate(mod.id);
                  onToggleExpanded?.(false);
                }}
                title={!expanded ? mod.label : undefined}
              >
                <span className="w-5 inline-flex justify-center shrink-0">
                  {mod.icon}
                </span>
                <span className={!expanded ? 'hidden md:inline' : ''}>{mod.label}</span>
              </Button>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
});
