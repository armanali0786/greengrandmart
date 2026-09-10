import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { requireRole } from '@/modules/auth/auth.guard';
import { z } from 'zod';
import * as repo from '@/modules/jobs/job.repository';
import { success, error } from '@/lib/api-response';

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §6: "admin can see failed jobs in an admin panel view" — no endpoint was ever documented for it, added this phase. */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    requireRole(user, ['admin']);
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await repo.findFailedJobs(query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
