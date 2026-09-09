import type { NextRequest } from 'next/server';
import { updateProfileSchema } from '@/modules/auth/auth.schema';
import { deleteMyAccount, getMyProfile, updateMyProfile } from '@/modules/auth/auth.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getMyProfile(req);
    return success(user);
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = updateProfileSchema.parse(await req.json());
    const user = await updateMyProfile(req, body);
    return success(user);
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await deleteMyAccount(req);
    return success({ deleted: true });
  } catch (e) {
    return error(e);
  }
}
