import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { getAddress } from '@/modules/auth/address.service';
import { getCart } from '@/modules/cart/cart.service';
import { checkoutQuoteSchema } from '@/modules/pricing/pricing.schema';
import { computeOrderTotal } from '@/modules/pricing/pricing.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = checkoutQuoteSchema.parse(await req.json());
    const [cart, address] = await Promise.all([
      getCart({ userId: user.id }),
      getAddress(user, body.shippingAddressId),
    ]);
    const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const breakdown = await computeOrderTotal({
      userId: user.id,
      items,
      shippingState: address.state,
      couponCode: body.couponCode,
    });
    return success(breakdown);
  } catch (e) {
    return error(e);
  }
}
