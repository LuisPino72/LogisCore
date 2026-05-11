import { type FC } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  className?: string;
}

export const SearchInput: FC<SearchInputProps> = ({ 
  onClear, 
  className, 
  value,
  ...props 
}) => {
  return (
    <div className={cn('search-input-wrapper', className)}>
      <div className="search-input-icon">
        <Search size={16} />
      </div>
      <input 
        className="search-input" 
        value={value}
        {...props} 
      />
      {value && (
        <button 
          type="button"
          onClick={onClear}
          className="search-input-clear"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
