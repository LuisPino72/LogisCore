export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateVET = fmt.format(date);
  const nowVET = fmt.format(now);

  if (dateVET === nowVET) return 'Hoy';

  const yesterdayVET = new Date(nowVET + 'T00:00:00-04:00');
  yesterdayVET.setDate(yesterdayVET.getDate() - 1);
  if (dateVET === fmt.format(yesterdayVET)) return 'Ayer';

  const dateStart = new Date(dateVET + 'T00:00:00-04:00');
  const nowStart = new Date(nowVET + 'T00:00:00-04:00');
  const diffDays = Math.round((nowStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
}
