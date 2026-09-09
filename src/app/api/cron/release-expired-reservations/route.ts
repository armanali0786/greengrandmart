import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { sweepExpiredReservations } from '@/modules/orders/reservation-sweep.service';

/**
 * docs/API_Spec.md §5's cron table: "Vercel Cron secret header" — Vercel
 * Cron sends `Authorization: Bearer $CRON_SECRET` by default when a cron
 * job is configured with a secret, so this checks that same header rather
 * than inventing a bespoke one. Not wrapped in the standard
 * success/data envelope (matches the webhook route's precedent: this is
 * infrastructure-triggered, not called by any frontend).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sweepExpiredReservations();
  return NextResponse.json(result);
}
