import { type FC, type ReactNode } from 'react';
import { Store, LogOut } from 'lucide-react';
import { Button } from './Button';

export interface SidebarModule {
  id: string;
  label: string;
  icon: ReactNode;
  enabled?: boolean;
}

interface SidebarProps {
  isOpen: boolean;
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
  onClose,
  modules,
  activeModule,
  onNavigate,
  userEmail,
  onLogout,
  footerSlot,
}) => {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-48 bg-white border-r border-gray-200
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-gray-100 shrink-0">
          <Store size={20} className="text-primary shrink-0" />
          <span className="font-title font-bold text-sm text-gray-900">LogisCore</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="py-2">
            {modules.map((mod) => (
              <Button
                key={mod.id}
                variant="ghost"
                className={`w-full rounded-none px-3 py-2 text-sm justify-start gap-2 font-normal ${
                  activeModule === mod.id
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-l-primary'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => {
                  onNavigate(mod.id);
                  if (window.innerWidth < 768) onClose();
                }}
              >
                <span className="w-5 inline-flex justify-center shrink-0">
                  {mod.icon}
                </span>
                <span>{mod.label}</span>
              </Button>
            ))}
          </nav>
          {footerSlot && (
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
            <span className="text-xs font-medium text-gray-700 truncate flex-1">{userEmail || 'Usuario'}</span>
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-danger hover:bg-red-50 transition-colors group"
            onClick={onLogout}
          >
            <LogOut size={14} className="group-hover:text-danger" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
};
