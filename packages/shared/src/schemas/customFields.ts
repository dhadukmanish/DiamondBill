import { z } from 'zod';
import { CUSTOM_FIELD_TYPES } from '../enums.js';

export const customFieldSchema = z.object({
  fieldLabel: z.string().min(1, 'Field label is required'),
  fieldName: z.string().optional(),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  moduleNames: z.array(z.string()).min(1, 'Select at least one module'),
  serialNo: z.number().int().optional().nullable(),
  options: z.array(z.object({ value: z.string(), label: z.string().optional() })).default([]),
  conditionalFields: z.record(z.array(z.string())).default({}),
  defaultValue: z.any().optional().nullable(),
  isRequired: z.boolean().default(false),
  isReadOnly: z.boolean().default(false),
  tooltip: z.string().optional().nullable(),
  showTooltip: z.boolean().default(false),
  diamondPropertyType: z.string().optional().nullable(),
  usedInLabProcess: z.boolean().default(false),
  useInRapaportAdditionalBack: z.boolean().default(false),
  displaySection: z.string().optional().nullable(),
});
export type CustomFieldInput = z.infer<typeof customFieldSchema>;
