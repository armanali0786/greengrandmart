import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { requireRole } from '@/modules/auth/auth.guard';
import { createBrandSchema } from '@/modules/catalog/catalog.schema';
import { createBrand, listBrands } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    requireRole(user, ['admin', 'staff']);
    const brands = await listBrands();
    return success(brands);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = createBrandSchema.parse(await req.json());
    const brand = await createBrand(user, body);
    return success(brand, 201);
  } catch (e) {
    return error(e);
  }
}
