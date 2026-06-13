import { useState, useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

const PREFIXES = ['V', 'E', 'J', 'G', 'P'] as const;
type Prefix = typeof PREFIXES[number];

interface CedulaInputProps {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
}

function splitValue(value: string): { prefix: Prefix; digits: string } {
  const match = value.match(/^([VEJGP])(\d*)$/i);
  if (match) {
    return { prefix: match[1].toUpperCase() as Prefix, digits: match[2] };
  }
  return { prefix: 'V', digits: value.replace(/[^0-9]/g, '') };
}

export function CedulaInput({
  label,
  value,
  onChange,
  placeholder = '12345678',
  hint,
  error,
  required = false,
  disabled = false,
  className,
  maxLength = 9,
}: CedulaInputProps) {
  const { prefix: initialPrefix, digits: initialDigits } = splitValue(value);
  const [prefix, setPrefix] = useState<Prefix>(initialPrefix);
  const [digits, setDigits] = useState(initialDigits);

  useEffect(() => {
    const { prefix: p, digits: d } = splitValue(value);
    setPrefix(p);
    setDigits(d);
  }, [value]);

  const emitChange = (p: Prefix, d: string) => {
    onChange(`${p}${d}`);
  };

  const handlePrefixChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value as Prefix;
    setPrefix(p);
    emitChange(p, digits);
  };

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, maxLength);
    setDigits(raw);
    emitChange(prefix, raw);
  };

  return (
    <div className={cn('input-wrapper', className)}>
      {label && (
        <label className={cn('input-label', required && 'after:content-["*"] after:text-danger after:ml-0.5')}>
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <div className="relative w-20 shrink-0">
          <select
            className={cn('input h-full text-center font-medium text-sm appearance-none pr-7', error && 'border-danger focus:border-danger focus:ring-danger')}
            value={prefix}
            onChange={handlePrefixChange}
            disabled={disabled}
          >
            {PREFIXES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <input
          type="text"
          inputMode="numeric"
          className={cn('input flex-1 text-sm', error && 'border-danger focus:border-danger focus:ring-danger')}
          placeholder={placeholder}
          value={digits}
          onChange={handleDigitsChange}
          disabled={disabled}
          maxLength={maxLength}
        />
      </div>
      {hint && !error && <span className="input-hint">{hint}</span>}
      {error && <span className="input-error">{error}</span>}
    </div>
  );
}
