import { z } from 'zod'

export const ImageLibrarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  categoryId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().url(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
})

export type ImageLibrary = z.infer<typeof ImageLibrarySchema>

export const CreateImageLibraryInputSchema = z.object({
  name: z.string().min(1).max(100),
  categoryId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().url(),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export type CreateImageLibraryInput = z.infer<typeof CreateImageLibraryInputSchema>

export const UpdateImageLibraryInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export type UpdateImageLibraryInput = z.infer<typeof UpdateImageLibraryInputSchema>
