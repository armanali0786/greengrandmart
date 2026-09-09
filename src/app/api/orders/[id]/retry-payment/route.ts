import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { retryPayment } from '@/modules/payments/payment.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/orders/[id]/retry-payment'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const result = await retryPayment(user, id);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
