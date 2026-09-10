import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { purgeExpiredOtpRequests } from '@/modules/otp/otp.service';
import { purgeOldRateLimitEvents } from '@/lib/rate-limit';

/**
 * Daily cron, not in API_Spec.md's original cron table but required by
 * ECOMMERCE_IMPLEMENTATION_PLAN.md §5.2 ("otp_requests rows older than 24h
 * are purged by a daily cron job") and Data_Model_DB_Schema.md §12's
 * rate_limit_events addendum — neither had a route/schedule ever specified,
 * added this phase. Same auth pattern as the other cron routes.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [otpRequestsPurged, rateLimitEventsPurged] = await Promise.all([
    purgeExpiredOtpRequests(),
    purgeOldRateLimitEvents(),
  ]);
  return NextResponse.json({ otpRequestsPurged, rateLimitEventsPurged });
}
