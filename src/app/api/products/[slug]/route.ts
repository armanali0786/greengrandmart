import type { NextRequest } from 'next/server';
import { getProductBySlug } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(_req: NextRequest, { params }: RouteContext<'/api/products/[slug]'>) {
  try {
    const { slug } = await params;
    const product = await getProductBySlug(slug);
    return success(product);
  } catch (e) {
    return error(e);
  }
}
