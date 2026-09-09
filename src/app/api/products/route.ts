import type { NextRequest } from 'next/server';
import { listProductsQuerySchema } from '@/modules/catalog/catalog.schema';
import { listProducts } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const query = listProductsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listProducts(query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
