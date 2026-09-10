import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/config/env';
import { RateLimitedError } from '@/lib/errors';
import { smsProvider } from '@/modules/otp/sms-provider';
import * as repo from '@/modules/otp/otp.repository';
import { OtpInvalidError } from '@/modules/otp/otp.errors';
import type { RequestOtpInput, VerifyOtpInput } from '@/modules/otp/otp.schema';
import type { RequestOtpResult, VerifyOtpResult } from '@/modules/otp/otp.types';

const MAX_REQUESTS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MINUTES = 10;

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Per-row random salt, not a single server-wide secret — a leaked `otp_requests` table doesn't let one precomputed table crack every row at once. Not bcrypt/scrypt: a 5-minute-lived, 5-attempt-limited 6-digit code doesn't need a slow KDF, just "not plaintext." */
function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function packHash(code: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${hashCode(code, salt)}`;
}

function verifyHash(code: string, packed: string): boolean {
  const [salt, expectedHex] = packed.split(':');
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from(hashCode(code, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * docs/Product_Spec_Requirements.md §9: 6-digit code, 5-minute expiry,
 * hashed at rest, max 3 requests/10min, 60s resend cooldown. Sends the SMS
 * synchronously (not through job_queue) — unlike the notification triggers,
 * an OTP send needs to report success/failure back to the checkout flow
 * immediately (docs/Architecture.md §5.5's request/response shape has no
 * async step), and nothing else in the spec sends SMS, so there's no
 * shared `SmsProvider` consumer to justify queuing this too.
 */
export async function requestOtp(
  input: RequestOtpInput,
  ipAddress: string | null,
): Promise<RequestOtpResult> {
  const recentCount = await repo.countRecentRequests(
    input.phone,
    input.purpose,
    RATE_LIMIT_WINDOW_MINUTES,
  );
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new RateLimitedError('Too many OTP requests. Please try again later.');
  }

  const latest = await repo.findLatestForPhone(input.phone, input.purpose);
  if (latest) {
    const secondsSinceLast = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (secondsSinceLast < env.OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast);
      throw new RateLimitedError(`Please wait ${wait}s before requesting another code.`);
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_SECONDS * 1000);
  await repo.createOtpRequestRow({
    phone: input.phone,
    purpose: input.purpose,
    codeHash: packHash(code),
    expiresAt,
    ipAddress,
  });

  await smsProvider.sendOtp({ phone: input.phone, code });

  return { sent: true, expiresInSeconds: env.OTP_EXPIRY_SECONDS };
}

/** Always targets the most recent request for this phone/purpose — a fresh `requestOtp()` call supersedes any earlier unverified code (Product_Spec_Requirements.md §9: "on failure/expiry, customer must request a new code"). */
export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const latest = await repo.findLatestForPhone(input.phone, 'cod_confirmation');
  if (!latest) throw new OtpInvalidError();

  if (latest.verified) {
    // Idempotent re-verify of an already-confirmed code — harmless, and
    // saves the customer from a confusing error if e.g. a double-tapped
    // submit fires twice.
    return { verified: true, verificationId: latest.id };
  }

  // The incorrect-guess attempt count must persist even when verification
  // ultimately fails — throwing from inside db.$transaction's callback
  // rolls back everything in it, including that same increment, so the
  // transaction always returns a plain result object here and the actual
  // error (if any) is thrown afterward, once the increment has committed.
  const result = await db.$transaction(async (tx) => {
    const locked = await repo.lockOtpRequestForUpdate(tx, latest.id);
    if (!locked || locked.verified) {
      return { outcome: 'verified' as const, verificationId: latest.id };
    }
    if (locked.expiresAt.getTime() < Date.now()) {
      return { outcome: 'expired' as const };
    }
    if (locked.attempts >= locked.maxAttempts) {
      return { outcome: 'too_many_attempts' as const };
    }

    await repo.incrementAttempts(tx, locked.id);

    if (!verifyHash(input.code, locked.codeHash)) {
      const remaining = locked.maxAttempts - (locked.attempts + 1);
      return { outcome: 'wrong_code' as const, remaining };
    }

    await repo.markVerified(tx, locked.id);
    return { outcome: 'verified' as const, verificationId: locked.id };
  });

  switch (result.outcome) {
    case 'verified':
      return { verified: true, verificationId: result.verificationId };
    case 'expired':
      throw new OtpInvalidError('This code has expired. Please request a new one.');
    case 'too_many_attempts':
      throw new OtpInvalidError('Too many incorrect attempts. Please request a new code.');
    case 'wrong_code':
      throw new OtpInvalidError(
        result.remaining > 0
          ? `Incorrect code. ${result.remaining} attempt${result.remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. Please request a new one.',
      );
  }
}

/**
 * Called from checkout when it's finally built for COD (Phase 6/9's own
 * documented deferral — see order.schema.ts's checkoutSchema comment):
 * confirms a given verificationId is a verified, still-fresh row for the
 * exact phone the order is being placed against, so a stale/foreign
 * verificationId can't be replayed.
 */
export async function isPhoneVerified(verificationId: string, phone: string): Promise<boolean> {
  const row = await repo.findById(verificationId);
  return !!row && row.verified && row.phone === phone;
}

/** docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §5.2: "otp_requests rows older than 24h are purged by a daily cron job." */
export async function purgeExpiredOtpRequests(): Promise<number> {
  return repo.deleteExpiredBefore(new Date(Date.now() - 24 * 60 * 60 * 1000));
}
