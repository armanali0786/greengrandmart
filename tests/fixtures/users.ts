import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { SessionUser } from '@/modules/auth/auth.types';

export async function createTestUser(overrides: Partial<SessionUser> = {}): Promise<SessionUser> {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      firebaseUid: overrides.firebaseUid ?? `test-fb-${suffix}`,
      email: overrides.email ?? `test-${suffix}@example.com`,
      name: overrides.name ?? 'Test User',
      role: overrides.role ?? 'customer',
    },
  });
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    role: user.role as SessionUser['role'],
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await db.address.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
}
