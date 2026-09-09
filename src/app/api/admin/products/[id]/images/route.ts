import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { confirmImageUploadSchema } from '@/modules/catalog/catalog.schema';
import { confirmImageUpload } from '@/modules/catalog/image-upload.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = confirmImageUploadSchema.parse(await req.json());
    const image = await confirmImageUpload(user, id, body);
    return success(image, 201);
  } catch (e) {
    return error(e);
  }
}
