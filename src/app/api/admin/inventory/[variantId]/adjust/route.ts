import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { adjustStockSchema } from '@/modules/inventory/inventory.schema';
import { adjustStock } from '@/modules/inventory/inventory.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/inventory/[variantId]/adjust'>,
) {
  try {
    const { variantId } = await params;
    const user = await getSessionUser(req);
    const body = adjustStockSchema.parse(await req.json());
    const result = await adjustStock(user, variantId, body);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
