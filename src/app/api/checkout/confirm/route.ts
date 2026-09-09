import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { confirmPaymentSchema } from '@/modules/payments/payment.schema';
import { confirmPayment } from '@/modules/payments/payment.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = confirmPaymentSchema.parse(await req.json());
    const result = await confirmPayment(user, body);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
