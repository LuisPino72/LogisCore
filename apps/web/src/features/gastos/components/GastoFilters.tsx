import { Input, SearchInput, Select } from '@/common/components';
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
          placeholder="Buscar descripción..."
          value={filters.search ?? ''}
          onChange={(e) => onChange({ search: e.target.value })}
          onClear={() => onChange({ search: '' })}
        />
      </div>
      <div className="w-full sm:w-40">
        <Select
          value={filters.category ?? 'all'}
          onChange={(e) => onChange({ category: e.target.value as GastoFiltersState['category'] })}
        >
          <option value="all">Todas</option>
          {EXPENSE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <Input
          type="month"
          value={filters.month ?? ''}
          onChange={(e) => onChange({ month: e.target.value })}
        />
      </div>
      <div className="w-full sm:w-36">
        <Select
          value={filters.status ?? 'all'}
          onChange={(e) => onChange({ status: e.target.value as GastoFiltersState['status'] })}
        >
          <option value="all">Todos</option>
          <option value="paid">Pagado</option>
          <option value="pending">Pendiente</option>
          <option value="cancelled">Cancelado</option>
        </Select>
      </div>
    </div>
  );
}
