import { describe, expect, it } from 'vitest';
import { requireOwnership, requireRole } from '@/modules/auth/auth.guard';
import { ForbiddenError } from '@/modules/auth/auth.errors';
import type { Role, SessionUser } from '@/modules/auth/auth.types';

function buildUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    firebaseUid: 'fb-1',
    email: 'a@b.com',
    name: 'Test User',
    phone: null,
    phoneVerified: false,
    role: 'customer',
    ...overrides,
  };
}

describe('requireRole', () => {
  const cases: { role: Role; allowed: Role[]; shouldPass: boolean }[] = [
    { role: 'customer', allowed: ['admin', 'staff'], shouldPass: false },
    { role: 'staff', allowed: ['admin', 'staff'], shouldPass: true },
    { role: 'admin', allowed: ['admin', 'staff'], shouldPass: true },
    { role: 'admin', allowed: ['admin'], shouldPass: true },
    { role: 'staff', allowed: ['admin'], shouldPass: false },
    { role: 'customer', allowed: ['customer'], shouldPass: true },
  ];

  for (const { role, allowed, shouldPass } of cases) {
    it(`${role} against [${allowed.join(',')}] ${shouldPass ? 'passes' : 'is forbidden'}`, () => {
      const user = buildUser({ role });
      if (shouldPass) {
        expect(() => requireRole(user, allowed)).not.toThrow();
      } else {
        expect(() => requireRole(user, allowed)).toThrow(ForbiddenError);
      }
    });
  }
});

describe('requireOwnership', () => {
  it('passes when the user owns the resource', () => {
    const user = buildUser({ id: 'user-1' });
    expect(() => requireOwnership(user, 'user-1')).not.toThrow();
  });

  it('throws ForbiddenError when the user does not own the resource', () => {
    const user = buildUser({ id: 'user-1' });
    expect(() => requireOwnership(user, 'user-2')).toThrow(ForbiddenError);
  });

  it('is forbidden regardless of role — role alone never satisfies ownership', () => {
    const admin = buildUser({ id: 'admin-1', role: 'admin' });
    expect(() => requireOwnership(admin, 'user-2')).toThrow(ForbiddenError);
  });
});
