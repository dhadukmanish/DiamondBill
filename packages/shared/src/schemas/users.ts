import { z } from 'zod';
import { USER_ROLES } from '../enums.js';

export const userSchema = z.object({
  userKind: z.enum(['system_user', 'employee', 'user_and_employee']).default('system_user'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Work email is required'),
  mobile: z.string().min(1, 'Mobile number is required'),
  role: z.enum(USER_ROLES).default('user'),
  password: z.string().min(6).optional(),
  firmIds: z.array(z.string().uuid()).min(1, 'Firm access is required'),
  branchIds: z.array(z.string().uuid()).min(1, 'Branch access is required'),
  statementFirmIds: z.array(z.string().uuid()).default([]),
  statementBranchIds: z.array(z.string().uuid()).default([]),
  contactVisibility: z.enum(['all', 'sales_person', 'assigned']).default('all'),
  permissions: z.record(z.array(z.enum(['read', 'create', 'update', 'delete']))).default({}),
  isActive: z.boolean().default(true),
});
export type UserInput = z.infer<typeof userSchema>;
