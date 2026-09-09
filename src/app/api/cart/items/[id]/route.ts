import type { NextRequest } from 'next/server';
import { resolveCartIdentity } from '@/modules/cart/cart.identity';
import { updateCartItemSchema } from '@/modules/cart/cart.schema';
import { removeItem, updateItemQuantity } from '@/modules/cart/cart.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(req: NextRequest, { params }: RouteContext<'/api/cart/items/[id]'>) {
  try {
    const { id } = await params;
    const identity = await resolveCartIdentity(req);
    const body = updateCartItemSchema.parse(await req.json());
    await updateItemQuantity(identity, id, body);
    return success({ id, quantity: body.quantity });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext<'/api/cart/items/[id]'>) {
  try {
    const { id } = await params;
    const identity = await resolveCartIdentity(req);
    await removeItem(identity, id);
    return success({ id });
  } catch (e) {
    return error(e);
  }
}
