import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { listInventory } from '@/modules/inventory/inventory.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const items = await listInventory(user);
    return success(items);
  } catch (e) {
    return error(e);
  }
}
