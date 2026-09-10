import { db } from '@/lib/db';
import { RateLimitedError } from '@/lib/errors';

interface RateLimitOptions {
  /** Sliding window size in seconds. */
  windowSeconds: number;
  /** Max requests allowed for `key` within the window. */
  maxRequests: number;
}

/**
 * Postgres-backed sliding-window rate limiter (docs/Security.md rate limiting
 * table; docs/Architecture.md §8) — deliberately not Redis, per AGENTS.md §1/§8.
 * `key` is a caller-composed bucket, e.g. `login:email:${email}` or
 * `checkout:user:${userId}`, so different limiters never collide.
 *
 * Not perfectly race-proof under very high concurrency on the same key
 * (count-then-insert, no row lock) — acceptable at this project's scale per
 * docs/Performance.md; upgrade to Redis only if that scaling trigger is
 * actually hit (docs/Architecture.md §9).
 */
export async function countRecentEvents(key: string, windowSeconds: number): Promise<number> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000);
  return db.rateLimitEvent.count({ where: { key, createdAt: { gt: windowStart } } });
}

export async function recordEvent(key: string): Promise<void> {
  await db.rateLimitEvent.create({ data: { key } });
}

/**
 * Convenience wrapper for the common case: every call counts toward the
 * limit immediately (checkout, OTP request/verify, coupon validation,
 * review creation, admin writes). For flows where only a *failure* should
 * count (login lockout — a correct password must not consume the budget),
 * use countRecentEvents()/recordEvent() directly instead — see
 * modules/auth/auth.service.ts checkLoginLockout()/recordLoginFailure().
 */
export async function enforceRateLimit(key: string, options: RateLimitOptions): Promise<void> {
  const count = await countRecentEvents(key, options.windowSeconds);
  if (count >= options.maxRequests) {
    throw new RateLimitedError();
  }
  await recordEvent(key);
}

/**
 * Data_Model_DB_Schema.md §12's rate_limit_events addendum: "a daily
 * cleanup job... should delete rows older than the longest configured
 * window" — no window used anywhere in this codebase exceeds a few
 * minutes, so 24h is a safe, generous retention. Called by the Phase 9
 * `/cron/purge-stale-data` route alongside the equivalent otp_requests purge.
 */
export async function purgeOldRateLimitEvents(): Promise<number> {
  const result = await db.rateLimitEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
