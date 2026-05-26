import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'LUZ', 'AGUA', 'GAS', 'INTERNET',
  'ALQUILER', 'NOMINA',
  'IMPUESTOS', 'OTROS',
] as const;

export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const ExpenseStatusSchema = z.enum(['pending', 'paid', 'cancelled']);
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;

export const RecurrenceTypeSchema = z.enum(['monthly', 'yearly']);
export type RecurrenceType = z.infer<typeof RecurrenceTypeSchema>;

export const GastoSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  createdByUserId: z.string(),
  category: ExpenseCategorySchema,
  amountUsd: z.number().positive('El monto debe ser mayor a 0'),
  exchangeRate: z.number().positive('La tasa debe ser mayor a 0'),
  amountBs: z.number().nonnegative(),
  description: z.string().max(200).optional(),
  date: z.string().min(1, 'Selecciona una fecha'),
  isRecurring: z.boolean(),
  recurrenceType: RecurrenceTypeSchema.optional(),
  nextDueDate: z.string().optional(),
  parentExpenseId: z.string().optional(),
  status: ExpenseStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export type Gasto = z.infer<typeof GastoSchema>;

export const CreateGastoInputSchema = z.object({
  category: ExpenseCategorySchema,
  amountUsd: z.number().positive('El monto debe ser mayor a 0'),
  exchangeRate: z.number().positive('La tasa debe ser mayor a 0'),
  description: z.string().max(200).optional(),
  date: z.string().min(1, 'Selecciona una fecha'),
  isRecurring: z.boolean(),
  recurrenceType: RecurrenceTypeSchema.optional(),
  status: ExpenseStatusSchema,
});

export type CreateGastoInput = z.infer<typeof CreateGastoInputSchema>;

export const UpdateGastoInputSchema = z.object({
  category: ExpenseCategorySchema.optional(),
  amountUsd: z.number().positive('El monto debe ser mayor a 0').optional(),
  exchangeRate: z.number().positive('La tasa debe ser mayor a 0').optional(),
  amountBs: z.number().nonnegative().optional(),
  description: z.string().max(200).optional(),
  date: z.string().min(1, 'Selecciona una fecha').optional(),
  status: ExpenseStatusSchema.optional(),
});

export type UpdateGastoInput = z.infer<typeof UpdateGastoInputSchema>;
