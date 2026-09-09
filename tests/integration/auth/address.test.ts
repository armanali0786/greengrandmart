import { describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import {
  addAddress,
  editAddress,
  listAddresses,
  removeAddress,
} from '@/modules/auth/address.service';
import { ForbiddenError } from '@/modules/auth/auth.errors';
import { NotFoundError } from '@/lib/errors';

const baseAddress = {
  name: 'Riya Sharma',
  phone: '9876543210',
  line1: '12 MG Road',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  country: 'IN',
  isDefaultShipping: false,
  isDefaultBilling: false,
};

describe('address service', () => {
  it('creating a second default-shipping address unsets the first', async () => {
    const user = await createTestUser();
    try {
      const first = await addAddress(user, { ...baseAddress, isDefaultShipping: true });
      expect(first.isDefaultShipping).toBe(true);

      const second = await addAddress(user, {
        ...baseAddress,
        line1: '99 Park Street',
        isDefaultShipping: true,
      });
      expect(second.isDefaultShipping).toBe(true);

      const addresses = await listAddresses(user);
      const refreshedFirst = addresses.find((a) => a.id === first.id);
      expect(refreshedFirst?.isDefaultShipping).toBe(false);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('default shipping and default billing are independent', async () => {
    const user = await createTestUser();
    try {
      const a = await addAddress(user, {
        ...baseAddress,
        isDefaultShipping: true,
        isDefaultBilling: true,
      });
      const b = await addAddress(user, {
        ...baseAddress,
        line1: '99 Park Street',
        isDefaultShipping: true,
      });

      const addresses = await listAddresses(user);
      const refreshedA = addresses.find((x) => x.id === a.id);
      const refreshedB = addresses.find((x) => x.id === b.id);
      expect(refreshedA?.isDefaultShipping).toBe(false);
      expect(refreshedA?.isDefaultBilling).toBe(true); // untouched — different flag
      expect(refreshedB?.isDefaultShipping).toBe(true);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("rejects editing another user's address (ownership, not just existence)", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    try {
      const address = await addAddress(owner, baseAddress);
      await expect(editAddress(attacker, address.id, { city: 'Mumbai' })).rejects.toThrow(
        ForbiddenError,
      );
      await expect(removeAddress(attacker, address.id)).rejects.toThrow(ForbiddenError);
    } finally {
      await deleteTestUser(owner.id);
      await deleteTestUser(attacker.id);
    }
  });

  it('throws NotFoundError for a nonexistent address', async () => {
    const user = await createTestUser();
    try {
      await expect(
        editAddress(user, '00000000-0000-0000-0000-000000000000', { city: 'Pune' }),
      ).rejects.toThrow(NotFoundError);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('deletes an address the user owns', async () => {
    const user = await createTestUser();
    try {
      const address = await addAddress(user, baseAddress);
      await removeAddress(user, address.id);
      const addresses = await listAddresses(user);
      expect(addresses.find((a) => a.id === address.id)).toBeUndefined();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
