import { listBrands } from '@/modules/catalog/catalog.service';
import { success, error } from '@/lib/api-response';

export async function GET() {
  try {
    const brands = await listBrands();
    return success(brands);
  } catch (e) {
    return error(e);
  }
}
