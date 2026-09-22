import { z } from 'zod';
import { CONTACT_TYPES } from '../enums.js';

const address = z.object({
  address: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  googleMapUrl: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
});

export const contactPersonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  mobile: z.string().optional().nullable(),
  isWhatsapp: z.boolean().default(false),
  email: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const contactSchema = z.object({
  firmId: z.string().uuid().optional().nullable(),
  contactType: z.enum(CONTACT_TYPES),
  companyName: z.string().min(1, 'Display / Company name is required'),
  contactPerson: z.string().optional().nullable(),
  phoneCode: z.string().default('+91'),
  phone: z.string().min(1, 'Mobile is required'),
  email: z.string().email().optional().nullable().or(z.literal('')),
  serialNo: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  gstTreatment: z.string().optional().nullable(),
  billingAddress: address.optional(),
  shippingAddresses: z.array(address).default([]),
  bankName: z.string().optional().nullable(),
  accountNo: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  ifscCode: z.string().optional().nullable(),
  swiftCode: z.string().optional().nullable(),
  contactPersons: z.array(contactPersonSchema).default([]),
  dob: z.string().optional().nullable(),
  salesPersonId: z.string().uuid().optional().nullable(),
  referenceContactId: z.string().uuid().optional().nullable(),
  discountType: z.enum(['fixed', 'percent']).default('fixed'),
  discountValue: z.number().optional().nullable(),
  paymentTermDays: z.number().int().optional().nullable(),
  paymentTermName: z.string().optional().nullable(),
  defaultTdsRateId: z.string().uuid().optional().nullable(),
  defaultTcsRateId: z.string().uuid().optional().nullable(),
  brokerageValue: z.number().optional().nullable(),
  creditLimitAmount: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  customFields: z.record(z.any()).default({}),
});
export type ContactInput = z.infer<typeof contactSchema>;
