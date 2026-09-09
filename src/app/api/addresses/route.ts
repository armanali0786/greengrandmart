import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { addressSchema } from '@/modules/auth/address.schema';
import { addAddress, listAddresses } from '@/modules/auth/address.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const addresses = await listAddresses(user);
    return success(addresses);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = addressSchema.parse(await req.json());
    const address = await addAddress(user, body);
    return success(address, 201);
  } catch (e) {
    return error(e);
  }
}
