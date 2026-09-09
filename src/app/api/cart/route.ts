import type { NextRequest } from 'next/server';
import { resolveCartIdentity } from '@/modules/cart/cart.identity';
import { getCart } from '@/modules/cart/cart.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const identity = await resolveCartIdentity(req);
    const cart = await getCart(identity);
    return success(cart);
  } catch (e) {
    return error(e);
  }
}
