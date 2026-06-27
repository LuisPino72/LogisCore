import { z } from 'zod';

export const FiscalSettingsSchema = z.object({
  ivaRate: z.number()
    .min(0, 'IVA no puede ser negativo')
    .max(1, 'IVA no puede superar el 100%')
    .multipleOf(0.01, 'IVA debe tener máximo 2 decimales'),
  igtfRate: z.number()
    .min(0, 'IGTF no puede ser negativo')
    .max(1, 'IGTF no puede superar el 100%')
    .multipleOf(0.01, 'IGTF debe tener máximo 2 decimales'),
  igtfEnabled: z.boolean(),
});

export const OperationSettingsSchema = z.object({
  maxDiscountPct: z.number()
    .min(0, 'Descuento no puede ser negativo')
    .max(100, 'Descuento no puede superar 100%'),
  defaultMinStock: z.number()
    .min(0, 'Stock mínimo no puede ser negativo'),
  defaultCreditLimit: z.number()
    .min(0, 'Límite de crédito no puede ser negativo'),
  mandatoryCustomerId: z.boolean(),
  lowStockThreshold: z.number()
    .min(0, 'Umbral de stock bajo no puede ser negativo'),
  ticketFooterMessage: z.string()
    .max(100, 'Mensaje demasiado largo (máx 100 caracteres)'),
  needsKitchenDefault: z.boolean().optional().default(false),
  defaultDeliveryFee: z.number().min(0).optional().default(0),
  pagoMovilEnabled: z.boolean().optional(),
  pagoMovilBank: z.string().optional(),
  pagoMovilHolder: z.string().optional(),
  pagoMovilId: z.string().optional(),
  pagoMovilPhone: z.string().optional(),
});

export const BusinessInfoSchema = z.object({
  name: z.string().min(1, 'El nombre del negocio es obligatorio').max(100, 'Nombre demasiado largo'),
  rif: z.string().regex(/^[VJEGP]\d{9}$/, 'RIF inválido (ej: J123456789)'),
  address: z.string().max(250, 'Dirección demasiado larga').optional().default(''),
  phone: z.string().max(20, 'Teléfono demasiado largo').optional().default(''),
  logoUrl: z.string().nullable().optional().default(null),
});

export const UpdateBusinessInfoSchema = BusinessInfoSchema.partial();

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(14).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/),
});

export type FiscalSettings = z.infer<typeof FiscalSettingsSchema>;
export type OperationSettings = z.infer<typeof OperationSettingsSchema>;
export type BusinessInfo = z.infer<typeof BusinessInfoSchema>;
export type UpdateBusinessInfo = z.infer<typeof UpdateBusinessInfoSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
