export function formatBs(value: number): string {
  const num = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `Bs ${num}`;
}
