import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { checkLoginLockout, recordLoginFailure } from '@/modules/auth/auth.service';
import { RateLimitedError } from '@/lib/errors';

const testEmail = `lockout-test-${Date.now()}@example.com`;

afterEach(async () => {
  await db.rateLimitEvent.deleteMany({ where: { key: { contains: testEmail } } });
});

describe('login lockout (docs/Product_Spec_Requirements.md: 5 failed attempts / 15 min)', () => {
  it('allows attempts under the threshold', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(checkLoginLockout(testEmail)).resolves.toBeUndefined();
      await recordLoginFailure(testEmail);
    }
  });

  it('locks out after the 5th recorded failure', async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(testEmail);
    }
    await expect(checkLoginLockout(testEmail)).rejects.toThrow(RateLimitedError);
  });

  it('is case-insensitive and trims whitespace on the email key', async () => {
    const mixedCaseEmail = `  ${testEmail.toUpperCase()}  `;
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(testEmail);
    }
    await expect(checkLoginLockout(mixedCaseEmail)).rejects.toThrow(RateLimitedError);
  });

  it('does not lock out a different email', async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(testEmail);
    }
    await expect(checkLoginLockout(`other-${testEmail}`)).resolves.toBeUndefined();
  });
});
