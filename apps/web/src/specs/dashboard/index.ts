import { z } from 'zod';

/** Dashboard Spec - DASH-001..003 */

export const ValidateDashboardTenantSchema = z.string().min(1, 'El ID del tenant es requerido.');

export const TenantInfoSchema = z.object({
  name: z.string(),
  slug: z.string(),
  rif: z.string(),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
});

export const SubscriptionInfoSchema = z.object({
  plan: z.string(),
  status: z.string(),
  expires_at: z.string().nullable(),
});
