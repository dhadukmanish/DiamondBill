import { z } from 'zod';
import { ACCOUNT_TYPES } from '../enums.js';

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  accountType: z.enum(ACCOUNT_TYPES),
  accountSubType: z.string().min(1, 'Sub type is required'),
  firmId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  currencyCode: z.string().min(3, 'Currency is required'),
  isGroup: z.boolean().default(false),
  description: z.string().max(500).optional().nullable(),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  ifscCode: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
});
export type AccountInput = z.infer<typeof accountSchema>;
