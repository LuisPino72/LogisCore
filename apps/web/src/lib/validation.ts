export interface ValidationRule {
  required?: boolean | string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
}

export function validateValue(value: string, rules: ValidationRule): string | null {
  if (rules.required) {
    const msg = typeof rules.required === 'string' ? rules.required : 'Este campo es obligatorio';
    if (!value || value.trim() === '') return msg;
  }
  if (!value) return null;

  if (rules.minLength && value.length < rules.minLength) {
    return `Mínimo ${rules.minLength} caracteres`;
  }
  if (rules.maxLength && value.length > rules.maxLength) {
    return `Máximo ${rules.maxLength} caracteres`;
  }
  if (rules.min !== undefined) {
    const num = parseFloat(value);
    if (!isNaN(num) && num < rules.min) return `Mínimo ${rules.min}`;
  }
  if (rules.max !== undefined) {
    const num = parseFloat(value);
    if (!isNaN(num) && num > rules.max) return `Máximo ${rules.max}`;
  }
  if (rules.pattern && !rules.pattern.test(value)) {
    return 'Formato inválido';
  }
  if (rules.custom) {
    return rules.custom(value);
  }
  return null;
}

export function sanitizeNumber(value: string, options?: { decimals?: number; allowNegative?: boolean }): string {
  const decimals = options?.decimals ?? 2;
  const allowNegative = options?.allowNegative ?? false;

  let sanitized = value;
  if (!allowNegative) {
    sanitized = sanitized.replace(/-/g, '');
  }
  sanitized = sanitized.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('');
  }
  if (decimals === 0) {
    sanitized = sanitized.replace(/\./g, '');
  } else if (parts[1] !== undefined && parts[1].length > decimals) {
    sanitized = parts[0] + '.' + parts[1].slice(0, decimals);
  }
  return sanitized;
}

export function formatCurrency(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}
