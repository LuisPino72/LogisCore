import { useNavigate } from 'react-router-dom';
import { CreditCard, ShoppingCart, DollarSign, Clock, ArrowRight, CheckCircle } from 'lucide-react';
import type { PendingTask } from '../types';

interface PendingTasksWidgetProps {
  tasks: PendingTask[];
  loading: boolean;
}

const TYPE_CONFIG = {
  expense: {
    icon: CreditCard,
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    label: 'Gastos sin pagar',
  },
  order: {
    icon: ShoppingCart,
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    label: 'Órdenes por recibir',
  },
  credit: {
    icon: DollarSign,
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    label: 'Cobros pendientes',
  },
} as const;

export function PendingTasksWidget({ tasks, loading }: PendingTasksWidgetProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="pending-tasks-widget">
        <div className="pending-tasks-loading">
          <Clock size={20} className="opacity-50 animate-spin" />
          <span>Cargando tareas...</span>
        </div>
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="pending-tasks-widget">
        <div className="pending-tasks-header">
          <Clock size={18} />
          <span>Tareas pendientes</span>
        </div>
        <div className="pending-tasks-empty">
          <CheckCircle size={18} />
          <span>Todo listo. No hay tareas pendientes.</span>
        </div>
      </div>
    );
  }

  const grouped = {
    expense: tasks.filter((t) => t.type === 'expense'),
    order: tasks.filter((t) => t.type === 'order'),
    credit: tasks.filter((t) => t.type === 'credit'),
  };

  return (
    <div className="pending-tasks-widget">
      <div className="pending-tasks-header">
        <Clock size={18} />
        <span>Tareas pendientes</span>
      </div>
      <div className="pending-tasks-list">
        {Object.entries(grouped).map(([type, items]) => {
          if (!items.length) return null;
          const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
          const Icon = config.icon;
          const count = items[0].totalCount ?? items.length;
          const isHighCount = count >= 5;
          return (
            <div
              key={type}
              className="pending-tasks-item"
              role="button"
              tabIndex={0}
              onClick={() => navigate(items[0].route)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(items[0].route); } }}
              style={{ '--accent': config.color, '--accent-bg': config.bgColor } as React.CSSProperties}
            >
              <div className="pending-tasks-item-icon">
                <Icon size={16} />
              </div>
              <div className="pending-tasks-item-content">
                <span className={`pending-tasks-item-count${isHighCount ? ' pending-tasks-item-count--alert' : ''}`}>{count}</span>
                <span className="pending-tasks-item-label">{config.label}</span>
              </div>
              <ArrowRight size={14} className="pending-tasks-item-arrow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
