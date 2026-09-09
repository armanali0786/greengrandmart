import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { createProductSchema, listProductsQuerySchema } from '@/modules/catalog/catalog.schema';
import { createProduct, listProductsForAdmin } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const query = listProductsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listProductsForAdmin(user, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = createProductSchema.parse(await req.json());
    const product = await createProduct(user, body);
    return success(product, 201);
  } catch (e) {
    return error(e);
  }
}
