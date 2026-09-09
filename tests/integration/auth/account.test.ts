import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { anonymizeUser, updateUserProfile } from '@/modules/auth/auth.repository';
import { addAddress } from '@/modules/auth/address.service';

describe('updateUserProfile', () => {
  it('updates name without touching phone', async () => {
    const user = await createTestUser();
    try {
      const updated = await updateUserProfile(user.id, { name: 'New Name' });
      expect(updated.name).toBe('New Name');
      expect(updated.phone).toBeNull();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('setting a phone number for the first time leaves phoneVerified false', async () => {
    const user = await createTestUser();
    try {
      const updated = await updateUserProfile(user.id, { phone: '9876543210' });
      expect(updated.phone).toBe('9876543210');
      expect(updated.phoneVerified).toBe(false);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('changing an already-verified phone resets phoneVerified to false', async () => {
    const user = await createTestUser();
    try {
      await db.user.update({
        where: { id: user.id },
        data: { phone: '9876543210', phoneVerified: true },
      });
      const updated = await updateUserProfile(user.id, { phone: '9123456789' });
      expect(updated.phone).toBe('9123456789');
      expect(updated.phoneVerified).toBe(false);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('re-submitting the same phone number does not reset phoneVerified', async () => {
    const user = await createTestUser();
    try {
      await db.user.update({
        where: { id: user.id },
        data: { phone: '9876543210', phoneVerified: true },
      });
      const updated = await updateUserProfile(user.id, {
        name: 'Same Phone',
        phone: '9876543210',
      });
      expect(updated.phoneVerified).toBe(true);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

describe('anonymizeUser (docs/Product_Spec_Requirements.md §1.4)', () => {
  it('strips PII, sets deletedAt, and hard-deletes addresses', async () => {
    const user = await createTestUser({ name: 'Real Name', email: 'real@example.com' });
    await addAddress(user, {
      name: 'Real Name',
      phone: '9876543210',
      line1: '12 MG Road',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500001',
      country: 'IN',
      isDefaultShipping: false,
      isDefaultBilling: false,
    });

    await anonymizeUser(user.id);

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.name).toBe('Deleted User');
    expect(row.email).toBe(`deleted+${user.id}@deleted.invalid`);
    expect(row.phone).toBeNull();
    expect(row.deletedAt).not.toBeNull();

    const addresses = await db.address.findMany({ where: { userId: user.id } });
    expect(addresses).toHaveLength(0);

    await db.user.delete({ where: { id: user.id } });
  });

  it('two anonymized users never collide on the email unique constraint', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    await anonymizeUser(userA.id);
    await expect(anonymizeUser(userB.id)).resolves.toBeUndefined();

    await db.user.delete({ where: { id: userA.id } });
    await db.user.delete({ where: { id: userB.id } });
  });
});
