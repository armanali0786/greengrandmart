import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { getSessionUser } from '@/modules/auth/auth.service';
import { devDirectUpload } from '@/modules/catalog/image-upload.service';
import { success, error } from '@/lib/api-response';

/**
 * Local-dev-only stand-in for a real signed-URL upload (Storage emulator
 * can't produce working signed URLs — see image-upload.service.ts's
 * requestImageUpload() comment). Refuses to run at all outside emulator
 * mode, so this route is inert in every real environment regardless of
 * what a client requests.
 */
export async function PUT(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/products/[id]/images/dev-upload'>,
) {
  if (!env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } },
      { status: 404 },
    );
  }

  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const storagePath = req.nextUrl.searchParams.get('storagePath');
    const contentType = req.headers.get('content-type') ?? 'application/octet-stream';
    if (!storagePath) throw new Error('Missing storagePath');

    const bytes = Buffer.from(await req.arrayBuffer());
    await devDirectUpload(user, id, storagePath, contentType, bytes);
    return success({ uploaded: true });
  } catch (e) {
    return error(e);
  }
}
