import { z } from 'zod';

/**
 * ISO datetime que acepta con o sin timezone (Z, +HH:MM, o sin offset).
 * Supabase timestamptz siempre trae timezone, pero Dexie/local puede no traerlo.
 */
export const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/));
