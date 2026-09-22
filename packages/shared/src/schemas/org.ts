import { z } from 'zod';

export const firmSchema = z.object({
  name: z.string().min(1, 'Firm name is required'),
  countryCode: z.string().min(2, 'Country is required'),
  gstTreatment: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  placeOfSupply: z.string().optional().nullable(),
  districtCode: z.string().optional().nullable(),
  contactNumbers: z.array(z.string()).default([]),
  emails: z.array(z.string()).default([]),
  taxIds: z.array(z.object({ label: z.string(), value: z.string().optional().nullable(), enabled: z.boolean() })).max(5).default([]),
  addressLine1: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  googleMapUrl: z.string().optional().nullable(),
  currency: z.string().min(3, 'Currency is required'),
  currencyFormat: z.string().default('1,234,567.89'),
  amountInWordsFormat: z.enum(['international', 'indian']).default('international'),
  timeZone: z.string().min(1, 'Time zone is required'),
  dateFormat: z.string().default('dd-MM-yyyy'),
  timeFormat: z.string().default('hh:mm tt'),
  fiscalYear: z.enum(['april-march', 'january-december']).default('april-march'),
  regulatedBank: z.object({ bankName: z.string().optional(), accountNo: z.string().optional(), branch: z.string().optional(), ifsc: z.string().optional(), swift: z.string().optional() }).optional(),
  unregulatedBank: z.object({ bankName: z.string().optional(), accountNo: z.string().optional(), branch: z.string().optional(), ifsc: z.string().optional(), swift: z.string().optional() }).optional(),
});
export type FirmInput = z.infer<typeof firmSchema>;

export const branchSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  name: z.string().min(1, 'Branch name is required'),
  address: z.string().optional().nullable(),
  userIds: z.array(z.string().uuid()).default([]),
});
export type BranchInput = z.infer<typeof branchSchema>;

export const fiscalYearSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  isActive: z.boolean().default(true),
});
export type FiscalYearInput = z.infer<typeof fiscalYearSchema>;

export const currencySchema = z.object({
  code: z.string().min(3).max(3),
  name: z.string().min(1),
  symbol: z.string().min(1),
  decimalPlaces: z.number().int().min(0).max(6).default(2),
});
