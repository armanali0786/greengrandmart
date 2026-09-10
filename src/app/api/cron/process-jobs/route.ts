import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { processPendingJobs } from '@/modules/jobs/job.service';

/**
 * docs/API_Spec.md §12 / Architecture.md §5.3: Vercel Cron, every 1 minute.
 * Same auth/response shape as the existing
 * /api/cron/release-expired-reservations (Authorization: Bearer
 * $CRON_SECRET, plain JSON, not the standard success/data envelope — this
 * is infrastructure-triggered, never called by any frontend).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processPendingJobs();
  return NextResponse.json(result);
}
