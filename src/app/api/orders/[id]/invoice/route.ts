import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { getInvoiceDownloadUrl } from '@/modules/invoices/invoice.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: RouteContext<'/api/orders/[id]/invoice'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const url = await getInvoiceDownloadUrl(user, id);
    return success({ url });
  } catch (e) {
    return error(e);
  }
}
