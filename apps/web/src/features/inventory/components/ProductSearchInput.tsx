import { SearchInput } from '../../../common/components';

interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function ProductSearchInput({ value, onChange, placeholder = 'Buscar por nombre o SKU...', maxLength = 20 }: ProductSearchInputProps) {
  return (
    <SearchInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClear={() => onChange('')}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  );
}
