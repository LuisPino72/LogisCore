import { type FC, type ReactNode } from 'react';
import { Store } from 'lucide-react';
import { LogoutButton } from './LogoutButton';

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
  footerSlot?: ReactNode;
}

export const Sidebar: FC<SidebarProps> = ({
  isOpen,
  onClose,
  modules,
  activeModule,
  onNavigate,
  userEmail,
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
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-30
        `}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-100 shrink-0">
          <Store size={24} className="text-primary" />
          <span className="font-title font-bold text-lg">LogisCore</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => {
                onNavigate(mod.id);
                onClose();
              }}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
                ${activeModule === mod.id
                  ? 'bg-primary/10 text-primary border-r-2 border-primary'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              {mod.icon}
              <span>{mod.label}</span>
            </button>
          ))}
        </nav>

        {footerSlot && (
          <div className="border-t border-gray-100 p-4 shrink-0">
            {footerSlot}
          </div>
        )}

        <div className="border-t border-gray-100 p-4 space-y-2 shrink-0">
          <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
};
