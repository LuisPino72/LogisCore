import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

export function cn(...inputs: (string | undefined | null | false | 0 | 0n)[]): string {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}
