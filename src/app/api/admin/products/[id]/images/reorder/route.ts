import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { reorderImagesSchema } from '@/modules/catalog/catalog.schema';
import { reorderImages } from '@/modules/catalog/image-upload.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images/reorder'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = reorderImagesSchema.parse(await req.json());
    await reorderImages(user, id, body);
    return success({ reordered: true });
  } catch (e) {
    return error(e);
  }
}
