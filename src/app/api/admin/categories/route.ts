import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { createCategorySchema } from '@/modules/catalog/catalog.schema';
import { createCategory, listCategoryTree } from '@/modules/catalog/catalog.service';
import { requireRole } from '@/modules/auth/auth.guard';
import { success, error } from '@/lib/api-response';

// Not itemized in docs/API_Spec.md (research brief gap #6) — designed
// following the same pattern as /admin/products (role-gated, audit-wrapped
// mutations), documented in API_Spec.md alongside the other Phase 3 additions.
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    requireRole(user, ['admin', 'staff']);
    const tree = await listCategoryTree();
    return success(tree);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = createCategorySchema.parse(await req.json());
    const category = await createCategory(user, body);
    return success(category, 201);
  } catch (e) {
    return error(e);
  }
}
