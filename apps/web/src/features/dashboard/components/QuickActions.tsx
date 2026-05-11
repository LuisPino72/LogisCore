import { FC } from 'react';
import { ShoppingCart, Package, Wallet, FileText } from 'lucide-react';

export interface QuickActionItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  enabled: boolean;
}

interface QuickActionsProps {
  actions: QuickActionItem[];
  onNavigate: (path: string) => void;
}

const iconMap: Record<string, FC<{ size?: number; className?: string }>> = {
  'shopping-cart': (props) => <ShoppingCart size={20} {...props} />,
  'package': (props) => <Package size={20} {...props} />,
  'wallet': (props) => <Wallet size={20} {...props} />,
  'file-text': (props) => <FileText size={20} {...props} />,
};

const bgColors: Record<string, string> = {
  pos: 'from-blue-500 to-blue-600',
  inventory: 'from-emerald-500 to-emerald-600',
  cash: 'from-amber-500 to-amber-600',
  reports: 'from-purple-500 to-purple-600',
};

export const QuickActions: FC<QuickActionsProps> = ({ actions, onNavigate }) => {
  if (actions.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-3 px-0.5">Acceso rápido</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = iconMap[action.icon];
          const gradient = bgColors[action.id] ?? 'from-gray-500 to-gray-600';

          return (
            <button
              key={action.id}
              onClick={() => action.enabled && onNavigate(action.path)}
              disabled={!action.enabled}
              className={`
                card p-4 flex flex-col items-center gap-2 text-center transition-all duration-150
                ${action.enabled
                  ? 'hover:shadow-md hover:-translate-y-px active:scale-[0.98] cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
                }
              `}
            >
              <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${gradient} flex items-center justify-center shadow-sm`}>
                {Icon && <Icon size={20} className="text-white" />}
              </div>
              <span className="text-xs font-medium text-gray-700">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
