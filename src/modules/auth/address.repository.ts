import { db } from '@/lib/db';
import type { AddressInput, UpdateAddressInput } from '@/modules/auth/address.schema';

export interface AddressRecord {
  id: string;
  userId: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export async function listAddressesForUser(userId: string): Promise<AddressRecord[]> {
  return db.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function findAddressById(id: string): Promise<AddressRecord | null> {
  return db.address.findUnique({ where: { id } });
}

/**
 * "Only one default shipping/billing address per user" is an app-level rule,
 * not a DB constraint (docs/Data_Model_DB_Schema.md §2 note) — enforced here
 * by unsetting the flag on every other address in the same transaction as
 * the write, so a concurrent request can't leave two defaults set.
 */
export async function createAddress(userId: string, input: AddressInput): Promise<AddressRecord> {
  return db.$transaction(async (tx) => {
    if (input.isDefaultShipping) {
      await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
    }
    if (input.isDefaultBilling) {
      await tx.address.updateMany({ where: { userId }, data: { isDefaultBilling: false } });
    }
    return tx.address.create({ data: { ...input, userId } });
  });
}

export async function updateAddress(
  id: string,
  userId: string,
  input: UpdateAddressInput,
): Promise<AddressRecord> {
  return db.$transaction(async (tx) => {
    if (input.isDefaultShipping) {
      await tx.address.updateMany({
        where: { userId, id: { not: id } },
        data: { isDefaultShipping: false },
      });
    }
    if (input.isDefaultBilling) {
      await tx.address.updateMany({
        where: { userId, id: { not: id } },
        data: { isDefaultBilling: false },
      });
    }
    return tx.address.update({ where: { id }, data: input });
  });
}

export async function deleteAddress(id: string): Promise<void> {
  await db.address.delete({ where: { id } });
}
