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
    .max(30, 'Mensaje demasiado largo (máx 30 caracteres)'),
  needsKitchenDefault: z.boolean().optional().default(false),
  defaultDeliveryFee: z.number().min(0).optional().default(0),
  pagoMovilEnabled: z.boolean().optional(),
  pagoMovilBank: z.string().max(30, 'Nombre del banco demasiado largo').optional(),
  pagoMovilHolder: z.string().max(25, 'Nombre del titular demasiado largo').optional(),
  pagoMovilId: z.string().max(11, 'Cédula/RIF demasiado largo').optional(),
  pagoMovilPhone: z.string().max(15, 'Teléfono demasiado largo').optional(),
}).superRefine((data, ctx) => {
  if (data.pagoMovilEnabled) {
    if (!data.pagoMovilBank || data.pagoMovilBank.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El banco es requerido cuando el pago móvil está habilitado', path: ['pagoMovilBank'] });
    }
    if (!data.pagoMovilHolder || data.pagoMovilHolder.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El titular es requerido cuando el pago móvil está habilitado', path: ['pagoMovilHolder'] });
    }
    if (!data.pagoMovilId || !/^[VJEGP]\d{7,10}$/.test(data.pagoMovilId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cédula/RIF inválido (ej: V12345678 o J123456789)', path: ['pagoMovilId'] });
    }
    if (!data.pagoMovilPhone || !/^0\d{10}$/.test(data.pagoMovilPhone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Teléfono inválido (ej: 04121234567)', path: ['pagoMovilPhone'] });
    }
  }
});

export const BusinessInfoSchema = z.object({
  name: z.string().min(1, 'El nombre del negocio es obligatorio').max(30, 'Nombre demasiado largo'),
  rif: z.string().regex(/^[VJEGP]\d{7,10}$/, 'RIF inválido (ej: J123456789)'),
  address: z.string().max(50, 'Dirección demasiado larga').optional().default(''),
  phone: z.string().max(15, 'Teléfono demasiado largo').optional().default(''),
  logoUrl: z.string().nullable().optional().default(null),
});

export const UpdateBusinessInfoSchema = BusinessInfoSchema.partial();

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // max(14) viene del límite de Supabase Auth (máx 72 chars, pero 14 es política del negocio)
  newPassword: z.string().min(8).max(14).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/),
});

export type FiscalSettings = z.infer<typeof FiscalSettingsSchema>;
export type OperationSettings = z.infer<typeof OperationSettingsSchema>;
export type BusinessInfo = z.infer<typeof BusinessInfoSchema>;
export type UpdateBusinessInfo = z.infer<typeof UpdateBusinessInfoSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
