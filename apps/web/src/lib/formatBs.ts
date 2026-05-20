function hasCents(value: number): boolean {
  return Math.round(Math.abs((value % 1) * 100)) > 0;
}

export function formatBs(value: number): string {
  const showDecimals = hasCents(value);
  const num = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value);
  return `Bs ${num}`;
}

export function formatUsd(value: number): string {
  const showDecimals = hasCents(value);
  return `$ ${showDecimals ? value.toFixed(2) : Math.round(value)}`;
}
