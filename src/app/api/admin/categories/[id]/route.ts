import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateCategorySchema } from '@/modules/catalog/catalog.schema';
import { deleteCategory, updateCategory } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/categories/[id]'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateCategorySchema.parse(await req.json());
    const category = await updateCategory(user, id, body);
    return success(category);
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/categories/[id]'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    await deleteCategory(user, id);
    return success({ deleted: true });
  } catch (e) {
    return error(e);
  }
}
