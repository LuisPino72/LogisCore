import { useState, useMemo } from 'react';
import { Plus, Receipt, RotateCcw, DollarSign } from 'lucide-react';
import { Button, Card, BottomNav, ModuleOnboarding, type BottomNavItem } from '@/common/components';
import { useFuzzySearch } from '@/lib/useFuzzySearch';
import { useAuthStore } from '../../auth/stores/authStore';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { useGastos } from '../hooks/useGastos';
import { useRecurringGastos } from '../hooks/useRecurringGastos';
import { useGastosStore } from '../stores/gastosStore';
import { GastoForm } from './GastoForm';
import { GastoList } from './GastoList';
import { GastoFilters } from './GastoFilters';
import type { CreateGastoInput } from '../types';

interface GastosPageProps {
  tenantId: string | null;
}

export function GastosPage({ tenantId }: GastosPageProps) {
  const { gastos, loading, filters, setFilters, createGasto, updateGasto, removeGasto } = useGastos(tenantId);
  const { recurringTemplates } = useRecurringGastos(tenantId);
  const { showForm, setShowForm } = useGastosStore();
  const isOnline = useOnlineStatus();
  const role = useAuthStore((s) => s.session?.role);

  const [activeTab, setActiveTab] = useState<'gastos' | 'recurrentes'>('gastos');

  const isOwner = role === 'owner' || role === 'admin';

  const baseList = activeTab === 'gastos' ? gastos : recurringTemplates;
  const fuzzyGastos = useFuzzySearch(baseList, filters.search || '', { keys: ['description'] });

  const filteredGastos = useMemo(() => {
    let list = fuzzyGastos;

    if (filters.status && filters.status !== 'all') {
      list = list.filter((g) => g.status === filters.status);
    }
    if (filters.category && filters.category !== 'all') {
      list = list.filter((g) => g.category === filters.category);
    }
    if (filters.month) {
      list = list.filter((g) => g.date.startsWith(filters.month!));
    }

    return list;
  }, [fuzzyGastos, filters.status, filters.category, filters.month]);

  const handleSubmit = async (data: CreateGastoInput) => {
    if (!tenantId) return false;
    const result = await createGasto(data);
    return result.ok;
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    await removeGasto(id);
  };

  const handleToggleStatus = async (id: string, status: 'paid' | 'pending') => {
    if (!tenantId) return;
    await updateGasto(id, { status });
  };

  const handleOpenNew = () => {
    setShowForm(true);
  };

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    {
      id: 'gastos',
      label: 'Gastos',
      icon: <Receipt size={20} />,
      onClick: () => setActiveTab('gastos'),
    },
    {
      id: 'recurrentes',
      label: 'Recurrentes',
      icon: <RotateCcw size={20} />,
      onClick: () => setActiveTab('recurrentes'),
    },
  ], []);

  if (!tenantId) {
    return (
      <div className="p-3 sm:p-6 max-w-6xl mx-auto">
        <Card>
          <div className="p-8 text-center text-text-secondary">
            <Receipt size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Selecciona un negocio para gestionar gastos</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Receipt size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-title font-bold truncate" style={{ fontSize: 'var(--text-fluid-xl)' }}>Gastos</h1>
            <p className="text-[11px] text-text-secondary hidden sm:block">Gestiona gastos operativos y recurrentes</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenNew} disabled={!isOnline}>
          <Plus size={16} />
          <span className="ml-1 hidden sm:inline">Nuevo gasto</span>
        </Button>
      </div>

      <div className="hidden sm:flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/60 p-1 sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 active:scale-[0.98] ${
            activeTab === 'gastos' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('gastos')}
        >
          <Receipt size={18} />
          Gastos
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-title font-medium rounded-lg transition-all duration-200 active:scale-[0.98] ${
            activeTab === 'recurrentes' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('recurrentes')}
        >
          <RotateCcw size={18} />
          Recurrentes
        </button>
      </div>

      <Card>
        <div className="p-4 space-y-4">
          <GastoFilters filters={filters} onChange={setFilters} />
          <GastoList
            gastos={filteredGastos}
            loading={loading}
            isOwner={isOwner}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
          />
        </div>
      </Card>
      </div>

      <BottomNav items={bottomNavItems} activeId={activeTab} className="sm:hidden" />

    {showForm && (
      <GastoForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
      />
    )}

    <ModuleOnboarding
      moduleId="gastos"
      steps={[
        {
          title: 'Gestiona tus Gastos',
          description: 'Aquí registras los gastos operativos de tu negocio: servicios, nómina, alquiler, etc. Lleva control de cada bolívar que sale.',
          icon: <Receipt size={24} className="text-white" />,
        },
        {
          title: 'Categorías de Gasto',
          description: 'Cada gasto tiene una categoría (luz, agua, internet, nómina...). Filtra por categoría para ver dónde gastas más.',
          icon: <DollarSign size={24} className="text-white" />,
        },
        {
          title: 'Gastos Recurrentes',
          description: 'Marca un gasto como recurrente (mensual o anual) y el sistema te recordará cuando toque pagarlo.',
          icon: <RotateCcw size={24} className="text-white" />,
        },
      ]}
      onComplete={() => {}}
    />
  </>
  );
}
