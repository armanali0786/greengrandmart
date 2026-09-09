import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateProductSchema } from '@/modules/catalog/catalog.schema';
import {
  archiveProduct,
  getProductForAdmin,
  updateProduct,
} from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: RouteContext<'/api/admin/products/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const product = await getProductForAdmin(user, id);
    return success(product);
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateProductSchema.parse(await req.json());
    const product = await updateProduct(user, id, body);
    return success(product);
  } catch (e) {
    return error(e);
  }
}

/** Soft-delete (archive), not a hard delete — docs/Product_Spec_Requirements.md §13.2. */
export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    await archiveProduct(user, id);
    return success({ archived: true });
  } catch (e) {
    return error(e);
  }
}
