import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { requestImageUploadSchema } from '@/modules/catalog/catalog.schema';
import { requestImageUpload } from '@/modules/catalog/image-upload.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images/upload-url'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = requestImageUploadSchema.parse(await req.json());
    const result = await requestImageUpload(user, id, body);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
