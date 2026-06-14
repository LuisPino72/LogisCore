import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

export function cn(...inputs: (string | undefined | null | false | 0 | 0n)[]): string {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Sin compras';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 30) return `Hace ${diffDays} días`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} años`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function unformatPhone(value: string): string {
  return value.replace(/\D/g, '');
}
