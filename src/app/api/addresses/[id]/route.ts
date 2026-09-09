import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateAddressSchema } from '@/modules/auth/address.schema';
import { editAddress, removeAddress } from '@/modules/auth/address.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(req: NextRequest, { params }: RouteContext<'/api/addresses/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateAddressSchema.parse(await req.json());
    const address = await editAddress(user, id, body);
    return success(address);
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext<'/api/addresses/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    await removeAddress(user, id);
    return success({ deleted: true });
  } catch (e) {
    return error(e);
  }
}
