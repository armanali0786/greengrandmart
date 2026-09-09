import { z } from 'zod';
import { indianPhoneSchema } from '@/modules/auth/auth.schema';

// postalCode regex is the exact one from docs/API_Spec.md ("Validation errors")
// and docs/Data_Model_DB_Schema.md's CHECK constraint — kept identical so a
// value that passes here can never fail the DB constraint.
const postalCodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.');

export const addressSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  phone: indianPhoneSchema,
  line1: z.string().trim().min(1, 'Address line 1 is required.').max(300),
  line2: z.string().trim().max(300).optional(),
  landmark: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1, 'City is required.').max(100),
  state: z.string().trim().min(1, 'State is required.').max(100),
  postalCode: postalCodeSchema,
  country: z.string().trim().length(2).default('IN'),
  isDefaultShipping: z.boolean().optional().default(false),
  isDefaultBilling: z.boolean().optional().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const updateAddressSchema = addressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
