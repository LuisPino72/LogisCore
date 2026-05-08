export function cn(...classes: (string | undefined | null | false | 0 | 0n)[]): string {
  return classes.filter(Boolean).join(' ');
}