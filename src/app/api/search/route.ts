import type { NextRequest } from 'next/server';
import { searchQuerySchema } from '@/modules/catalog/catalog.schema';
import { searchProducts } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const query = searchQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await searchProducts(query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
