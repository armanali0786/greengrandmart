import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export async function createTestAddress(
  userId: string,
  overrides: Partial<Prisma.AddressCreateInput> = {},
): Promise<{ id: string; state: string }> {
  return db.address.create({
    data: {
      user: { connect: { id: userId } },
      name: 'Test Customer',
      phone: '9876543210',
      line1: '1 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'IN',
      ...overrides,
    },
    select: { id: true, state: true },
  });
}
