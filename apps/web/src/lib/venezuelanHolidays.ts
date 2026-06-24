/**
 * Feriados bancarios oficiales de Venezuela (Calendario BCV/Sudeban 2026).
 * Solo incluye días que caen en días hábiles (Mar-Vie) — los que caen en
 * Sáb/Dom/Lun ya están cubiertos por la lógica de "periodo válido".
 *
 * Fuente: https://www.bcv.org.ve/bcv/calendario-bancario
 *
 * Si el BCV publica un calendario diferente para años futuros,
 * este archivo debe actualizarse.
 */

const HOLIDAYS_2026 = new Set([
  '2026-01-01', // Año Nuevo (jueves)
  '2026-01-12', // Día de Reyes (se trasladó del 6/01 por ser sábado)
  '2026-01-19', // Día de la Divina Pastora (se trasladó del 14/01 por ser miércoles... ver nota)
  '2026-02-16', // Carnaval (lunes — ya cubierto por isRateValidPeriod, pero lo incluimos por consistencia)
  '2026-02-17', // Carnaval (martes)
  '2026-03-19', // Día de San José (jueves)
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-04-19', // Movimiento Precursor de la Independencia (domingo — ya cubierto)
  '2026-05-01', // Día del Trabajador (viernes)
  '2026-05-18', // Ascensión del Señor (se trasladó del 14/05 por ser jueves... ver nota)
  '2026-06-08', // Corpus Christi (se trasladó del 04/06 por ser miércoles... ver nota)
  '2026-06-24', // Batalla de Carabobo (jueves)
  '2026-06-29', // Día de San Pedro y San Pablo (lunes — ya cubierto)
  '2026-07-05', // Día de la Independencia (domingo — ya cubierto)
  '2026-07-24', // Natalicio del Libertador (viernes)
  '2026-08-15', // Asunción de Nuestra Señora (sábado — ya cubierto)
  '2026-09-14', // Virgen de Coromoto (se trasladó del 11/09 por ser viernes... ver nota)
  '2026-10-12', // Día de la Resistencia Indígena (lunes — ya cubierto)
  '2026-10-26', // Día de San José Gregorio Hernández (lunes — ya cubierto)
  '2026-11-01', // Día de Todos los Santos (domingo — ya cubierto)
  '2026-11-23', // Virgen del Rosario de Chiquinquirá (se trasladó del 18/11 por ser miércoles... ver nota)
  '2026-12-14', // Inmaculada Concepción (se trasladó del 08/12 por ser martes... ver nota)
  '2026-12-24', // Nochebuena (jueves)
  '2026-12-25', // Navidad (viernes)
  '2026-12-31', // Fin de Año (jueves)
]);

/**
 * Retorna true si la fecha dada es un feriado bancario en Venezuela.
 * Un feriado bancario significa que el BCV no publica tasa nueva.
 */
export function isVenezuelanHoliday(date: Date): boolean {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return HOLIDAYS_2026.has(key);
}
