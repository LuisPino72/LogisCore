import { z } from 'zod';

/** Customers Spec - CUST-001..005 */

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().optional(),
  name: z.string().min(1, 'Nombre requerido').max(25, 'Máximo 25 caracteres'),
  phone: z
    .string()
    .regex(/^$|^0\d{10}$/, 'Formato: 04121234567')
    .max(14, 'Máximo 14 caracteres')
    .optional()
    .or(z.literal('')),
  address: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'Límite no puede ser negativo').max(9999.99).default(0),
  balance: z.number().min(0).max(9999.99).default(0),
  notes: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
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

export const CustomerHistoryQuerySchema = z
  .object({
    customerId: z.string().uuid(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export type CustomerHistoryQuery = z.infer<typeof CustomerHistoryQuerySchema>;
