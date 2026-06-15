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
          <Clock size={20} style={{ opacity: 0.5 }} />
          <span>Cargando tareas...</span>
        </div>
        <style>{STYLES}</style>
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
          <CheckCircle size={18} style={{ color: '#22C55E' }} />
          <span>Todo listo. No hay tareas pendientes.</span>
        </div>
        <style>{STYLES}</style>
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
                <span className="pending-tasks-item-count">{count}</span>
                <span className="pending-tasks-item-label">{config.label}</span>
              </div>
              <ArrowRight size={14} className="pending-tasks-item-arrow" />
            </div>
          );
        })}
      </div>
      <style>{STYLES}</style>
    </div>
  );
}

const STYLES = `
  .pending-tasks-widget {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pending-tasks-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-secondary, #94A3B8);
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pending-tasks-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-secondary, #94A3B8);
    font-size: 0.875rem;
    padding: 16px;
    justify-content: center;
  }

  .pending-tasks-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #22C55E;
    font-size: 0.875rem;
    padding: 16px;
    justify-content: center;
  }

  .pending-tasks-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pending-tasks-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--accent-bg);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pending-tasks-item:hover {
    background: var(--accent-bg);
    filter: brightness(1.1);
    transform: translateX(2px);
  }

  .pending-tasks-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .pending-tasks-item:active {
    transform: scale(0.98);
  }

  .pending-tasks-item-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pending-tasks-item-content {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .pending-tasks-item-count {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent);
  }

  .pending-tasks-item-label {
    font-size: 0.8rem;
    color: var(--color-text-secondary, #94A3B8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pending-tasks-item-arrow {
    color: var(--accent);
    opacity: 0.6;
    flex-shrink: 0;
  }

  @media (min-width: 768px) {
    .pending-tasks-item {
      padding: 8px 10px;
    }

    .pending-tasks-item-icon {
      width: 28px;
      height: 28px;
    }

    .pending-tasks-item-count {
      font-size: 0.95rem;
    }

    .pending-tasks-item-label {
      font-size: 0.75rem;
    }
  }
`;
