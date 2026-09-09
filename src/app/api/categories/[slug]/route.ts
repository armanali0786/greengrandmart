import type { NextRequest } from 'next/server';
import { listCategoryProductsQuerySchema } from '@/modules/catalog/catalog.schema';
import { getCategoryWithProducts } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: RouteContext<'/api/categories/[slug]'>) {
  try {
    const { slug } = await params;
    const query = listCategoryProductsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const result = await getCategoryWithProducts(slug, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
