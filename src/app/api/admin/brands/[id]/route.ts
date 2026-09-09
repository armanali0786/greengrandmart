import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateBrandSchema } from '@/modules/catalog/catalog.schema';
import { deleteBrand, updateBrand } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(req: NextRequest, { params }: RouteContext<'/api/admin/brands/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateBrandSchema.parse(await req.json());
    const brand = await updateBrand(user, id, body);
    return success(brand);
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext<'/api/admin/brands/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    await deleteBrand(user, id);
    return success({ deleted: true });
  } catch (e) {
    return error(e);
  }
}
