import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { deleteImage, setPrimaryImage } from '@/modules/catalog/image-upload.service';
import { success, error } from '@/lib/api-response';

/** Only `{ isPrimary: true }` is supported for now — that's the only in-place edit the UI needs. */
export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images/[imageId]'>,
) {
  try {
    const { id, imageId } = await params;
    const user = await getSessionUser(req);
    const body = (await req.json()) as { isPrimary?: boolean };
    if (body.isPrimary !== true) {
      return success({ updated: false });
    }
    const image = await setPrimaryImage(user, id, imageId);
    return success(image);
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images/[imageId]'>,
) {
  try {
    const { id, imageId } = await params;
    const user = await getSessionUser(req);
    await deleteImage(user, id, imageId);
    return success({ deleted: true });
  } catch (e) {
    return error(e);
  }
}
