import { z } from 'zod';
import { SERIES_USED_FOR, SERIES_TYPES } from '../enums.js';

export const seriesSchema = z
  .object({
    firmId: z.string().uuid('Firm is required'),
    branchId: z.string().uuid().optional().nullable(),
    usedFor: z.enum(SERIES_USED_FOR),
    seriesType: z.enum(SERIES_TYPES),
    fiscalYearId: z.string().uuid('Financial year is required'),
    prefix: z.string().default(''),
    postfix: z.string().default(''),
    paddingLength: z.number().int().min(1).max(10).default(1),
    isDefault: z.boolean().default(false),
  })
  .refine((v) => v.prefix.trim() !== '' || v.postfix.trim() !== '', { message: 'At least one of Prefix or Postfix is required', path: ['prefix'] });
export type SeriesInput = z.infer<typeof seriesSchema>;

export const seriesBulkSchema = z.object({
  firmId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  fiscalYearId: z.string().uuid(),
  rows: z.array(
    z.object({
      usedFor: z.enum(SERIES_USED_FOR),
      regulated: z.object({ prefix: z.string().default(''), postfix: z.string().default(''), paddingLength: z.number().int().min(1).default(1), isDefault: z.boolean().default(true) }).optional(),
      unregulated: z.object({ prefix: z.string().default(''), postfix: z.string().default(''), paddingLength: z.number().int().min(1).default(1), isDefault: z.boolean().default(false) }).optional(),
    }),
  ),
});
