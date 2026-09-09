import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { initiateRefundSchema, listRefundsQuerySchema } from '@/modules/refunds/refund.schema';
import { initiateRefund, listRefundsForAdmin } from '@/modules/refunds/refund.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const query = listRefundsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listRefundsForAdmin(user, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = initiateRefundSchema.parse(await req.json());
    const result = await initiateRefund(user, body);
    return success(result, 201);
  } catch (e) {
    return error(e);
  }
}
