import { forwardRef, useState, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDebounce } from '../../common/hooks/useDebounce';

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  onClear?: () => void;
  className?: string;
  debounceMs?: number;
  onSearch?: (value: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  value?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  onClear,
  className,
  value,
  debounceMs = 300,
  onSearch,
  onChange,
  ...props
}, ref) => {
  const [internalValue, setInternalValue] = useState(value ?? '');
  const debouncedValue = useDebounce(internalValue, debounceMs);
  const internalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (onSearch && debouncedValue !== undefined && debouncedValue !== internalValue) {
      onSearch(debouncedValue);
    }
  }, [debouncedValue, onSearch, internalValue]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setInternalValue(e.target.value);
    onChange?.(e);
  }, [onChange]);

  const handleClear = useCallback(() => {
    setInternalValue('');
    onClear?.();
    if (onSearch) onSearch('');
    const input = (ref as React.RefObject<HTMLInputElement>)?.current || internalRef.current;
    input?.focus();
  }, [onClear, onSearch, ref]);

  const displayValue = value !== undefined ? value : internalValue;

  return (
    <div className={cn('search-input-wrapper', className)}>
      <div className="search-input-icon">
        <Search size={16} />
      </div>
      <input
        ref={(node) => {
          internalRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }}
        className="search-input"
        value={displayValue}
        onChange={handleChange}
        {...props}
      />
      {displayValue && (
        <button
          type="button"
          onClick={handleClear}
          className="search-input-clear"
          aria-label="Limpiar búsqueda"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
});
SearchInput.displayName = 'SearchInput';
