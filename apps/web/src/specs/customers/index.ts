import { z } from 'zod';
import { isoDateTime } from '../helpers';

/** Customers Spec - CUST-001..005 */

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().optional(),
  name: z.string().min(1, 'Nombre requerido').max(25, 'Máximo 25 caracteres'),
  // AUDIT-017: Cédula field V/E/J/P + 6-8 digits (no digit verifier, just letter + digits)
  cedula: z
    .string()
    .regex(/^[VEJGP]\d{6,8}$/i, 'Cédula inválida (formato: V12345678)')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .regex(/^$|^0\d{10}$/, 'Formato: 04121234567')
    .max(14, 'Máximo 14 caracteres')
    .optional()
    .or(z.literal('')),
  address: z.string().max(100, 'Máximo 100 caracteres').optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'Límite no puede ser negativo').max(9999.99).default(0),
  balance: z.number().min(0).max(9999.99).default(0),
  notes: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.optional(),
  lastPurchaseAt: isoDateTime.optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerInputSchema = CustomerSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  balance: true,
})
  .extend({
    name: z.string().min(1, 'Nombre requerido').max(25, 'Máximo 25 caracteres'),
    creditLimit: z
      .number()
      .min(0, 'Límite no puede ser negativo')
      .max(9999.99)
      .default(0)
      .optional(),
    notes: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;

export const UpdateCustomerInputSchema = CreateCustomerInputSchema.partial();

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInputSchema>;

// PLAN-112 (C1): customerId es opcional para soportar "historial global" (todas las
// ventas del tenant). Si customerId presente, filtra por ese cliente; si no, retorna
// todas las ventas del tenant que tengan customerId asignado.
export const CustomerHistoryQuerySchema = z
  .object({
    customerId: z.string().uuid().optional(),
    dateFrom: isoDateTime.optional(),
    dateTo: isoDateTime.optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export type CustomerHistoryQuery = z.infer<typeof CustomerHistoryQuerySchema>;
