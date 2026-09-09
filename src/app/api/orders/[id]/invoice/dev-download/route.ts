import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { getSessionUserFromToken } from '@/modules/auth/auth.service';
import { getInvoiceBytesForDownload } from '@/modules/invoices/invoice.service';
import { error } from '@/lib/api-response';

/**
 * Local-dev-only stand-in for a real signed-URL download (Storage emulator
 * can't produce working signed URLs — see invoice.service.ts's
 * getInvoiceDownloadUrl() comment). A plain browser navigation to this URL
 * carries no Authorization header, so the token travels as a query param
 * instead (`?token=`) — acceptable only because this route refuses to run
 * at all outside emulator mode, so it's inert (404) in every real
 * environment regardless of what a client requests.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext<'/api/orders/[id]/invoice/dev-download'>,
) {
  if (!env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } },
      { status: 404 },
    );
  }

  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get('token');
    if (!token) throw new Error('Missing token');
    const user = await getSessionUserFromToken(token);

    const { bytes } = await getInvoiceBytesForDownload(user, id);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
      },
    });
  } catch (e) {
    return error(e);
  }
}
