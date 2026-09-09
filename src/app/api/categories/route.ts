import { listCategoryTree } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET() {
  try {
    const tree = await listCategoryTree();
    return success(tree);
  } catch (e) {
    return error(e);
  }
}
