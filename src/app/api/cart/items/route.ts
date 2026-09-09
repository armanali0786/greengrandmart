import type { NextRequest } from 'next/server';
import { resolveCartIdentity } from '@/modules/cart/cart.identity';
import { addCartItemSchema } from '@/modules/cart/cart.schema';
import { addItem } from '@/modules/cart/cart.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const identity = await resolveCartIdentity(req);
    const body = addCartItemSchema.parse(await req.json());
    const result = await addItem(identity, body);
    return success(result, 201);
  } catch (e) {
    return error(e);
  }
}
