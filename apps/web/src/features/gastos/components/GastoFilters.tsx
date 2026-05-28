import { Input, SearchInput, SearchableSelect } from '@/common/components';
import { EXPENSE_CATEGORIES, type GastoFiltersState } from '../types';

interface GastoFiltersProps {
  filters: GastoFiltersState;
  onChange: (filters: Partial<GastoFiltersState>) => void;
}

export function GastoFilters({ filters, onChange }: GastoFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1">
        <SearchInput
          placeholder="Buscar gasto"
          value={filters.search ?? ''}
          onChange={(e) => onChange({ search: e.target.value })}
          onClear={() => onChange({ search: '' })}
        />
      </div>
      <div className="w-full sm:w-40">
        <SearchableSelect
          value={filters.category ?? 'all'}
          onChange={(val) => onChange({ category: val as GastoFiltersState['category'] })}
          placeholder="Todas"
          searchPlaceholder="Buscar..."
          options={[
            { value: 'all', label: 'Todas' },
            ...EXPENSE_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
          ]}
          hideSearch={EXPENSE_CATEGORIES.length <= 10}
        />
      </div>
      <div className="w-full sm:w-40">
        <Input
          type="month"
          value={filters.month ?? ''}
          onChange={(e) => onChange({ month: e.target.value })}
        />
      </div>
      <div className="w-full sm:w-36">
        <SearchableSelect
          value={filters.status ?? 'all'}
          onChange={(val) => onChange({ status: val as GastoFiltersState['status'] })}
          placeholder="Todos"
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'paid', label: 'Pagado' },
            { value: 'pending', label: 'Pendiente' },
          ]}
          hideSearch
        />
      </div>
    </div>
  );
}
