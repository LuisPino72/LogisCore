import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
import Fuse from 'fuse.js';
import { cn } from '../../lib/utils';
import { useClickOutside } from '../hooks/useClickOutside';

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  noResultsText?: string;
  footer?: React.ReactNode;
  hideSearch?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  className,
  noResultsText = 'Sin resultados',
  footer,
  hideSearch,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useClickOutside([wrapperRef, menuRef], () => setIsOpen(false));

  const selectedOption = options.find((o) => o.value === value);

  const fuse = useMemo(
    () => new Fuse(options, {
      keys: ['label'],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: false,
    }),
    [options],
  );

  const filteredOptions = hideSearch
    ? options
    : search.trim().length < 1
      ? options
      : fuse.search(search).map((r) => r.item);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setSearch('');
    setHighlightIdx(0);
    if (!hideSearch) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [hideSearch]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredOptions[highlightIdx]) {
      e.preventDefault();
      handleSelect(filteredOptions[highlightIdx].value);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlightIdx] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, isOpen]);

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        onKeyDown={handleKeyDown}
        className={cn('select w-full text-left truncate pr-8', !selectedOption && 'text-text-muted')}
      >
        {selectedOption ? selectedOption.label : placeholder}
      </button>
      <div className={cn('select-arrow', isOpen && 'select-arrow-open')}>
        <ChevronDown size={16} />
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg animate-slide-down"
          style={{
            top: wrapperRef.current ? wrapperRef.current.getBoundingClientRect().bottom + 4 : 0,
            left: wrapperRef.current ? (() => {
              const rect = wrapperRef.current.getBoundingClientRect();
              const menuWidth = Math.max(200, rect.width);
              const padding = 8;
              return Math.max(padding, Math.min(rect.left, window.innerWidth - menuWidth - padding));
            })() : 0,
   minWidth: wrapperRef.current ? Math.max(200, wrapperRef.current.getBoundingClientRect().width) : 200,
      maxWidth: wrapperRef.current ? wrapperRef.current.getBoundingClientRect().width : '100%',
      boxSizing: 'border-box',
          }}
        >
          {!hideSearch && (
            <div className="relative border-b border-gray-100">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2.5 text-sm outline-none bg-transparent"
              />
            </div>
          )}

          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{
              maxHeight: wrapperRef.current
                ? Math.min(320, window.innerHeight - wrapperRef.current.getBoundingClientRect().bottom - 12 - (hideSearch ? 0 : 44))
                : 320,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">{noResultsText}</div>
            ) : (
              filteredOptions.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    opt.value === value && 'bg-primary/5 font-medium',
                    idx === highlightIdx && 'bg-gray-50 hover:bg-gray-100',
                    'hover:bg-gray-50'
                  )}
                >
                  {opt.label}
                </button>
              ))
            )}
            {footer && (
              <div className="border-t border-gray-100">
                {footer}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
