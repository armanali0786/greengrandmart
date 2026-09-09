import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '@/config/env';
import { DomainError, NotFoundError } from '@/lib/errors';
import { getPublicImageUrl, getStorageBucket } from '@/lib/firebase-storage';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import * as repo from '@/modules/catalog/catalog.repository';
import type {
  ConfirmImageUploadInput,
  ReorderImagesInput,
  RequestImageUploadInput,
} from '@/modules/catalog/catalog.schema';
import type { ProductImageDetail } from '@/modules/catalog/catalog.types';

/**
 * docs/Security.md §9 rule 1: never trust the client-reported MIME type.
 * Not itemized as its own error code in docs/API_Spec.md (added during
 * Phase 3 implementation, same pattern as ConflictError).
 */
export class InvalidImageError extends DomainError {
  readonly code = 'INVALID_IMAGE' as const;
  readonly httpStatus = 400;

  constructor(message = 'The uploaded file is not a valid image.') {
    super(message);
  }
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_DIMENSION = 1600;
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

function extensionForContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[contentType] ?? 'bin';
}

function toImageDetail(image: {
  id: string;
  storagePath: string;
  altText: string | null;
  isPrimary: boolean;
  variantId: string | null;
  sortOrder: number;
}): ProductImageDetail {
  return {
    id: image.id,
    url: getPublicImageUrl(image.storagePath),
    altText: image.altText,
    isPrimary: image.isPrimary,
    variantId: image.variantId,
    sortOrder: image.sortOrder,
  };
}

/**
 * docs/Architecture.md §5.4: the server only issues an authorized upload
 * target — raw bytes go client → Storage directly via this signed URL,
 * never through the Next.js server, avoiding Vercel function payload limits.
 *
 * Local-dev exception: the Firebase Storage *emulator* can't actually
 * produce a working signed URL — GCS URL-signing is a real cryptographic
 * operation requiring a service account key, which the emulator has no
 * substitute for (it fails with "Could not load the default credentials").
 * This is an emulator limitation, not a production one — real Firebase
 * Storage with real Admin SDK credentials signs correctly. So in emulator
 * mode only, this returns our own dev-upload route instead of a real signed
 * URL; the client's upload code (PUT the file, same either way) doesn't
 * need to know the difference. The route itself independently refuses to
 * run unless the emulator flag is set, so this can never activate in
 * production even if `uploadMethod` were somehow spoofed.
 */
export async function requestImageUpload(
  user: SessionUser,
  productId: string,
  input: RequestImageUploadInput,
): Promise<{ uploadUrl: string; storagePath: string }> {
  requireRole(user, ['admin', 'staff']);
  const product = await repo.findProductById(productId);
  if (!product) throw new NotFoundError('Product not found.');

  const storagePath = `products/${productId}/${randomUUID()}.${extensionForContentType(input.contentType)}`;

  if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    const uploadUrl = `/api/admin/products/${productId}/images/dev-upload?storagePath=${encodeURIComponent(storagePath)}`;
    return { uploadUrl, storagePath };
  }

  const file = getStorageBucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType: input.contentType,
  });

  return { uploadUrl, storagePath };
}

/**
 * Dev-only direct upload used in place of a signed URL when running against
 * the Storage emulator — see requestImageUpload()'s comment. Still goes
 * through the same role check; the route handler additionally refuses to
 * run at all unless the emulator flag is set.
 */
export async function devDirectUpload(
  user: SessionUser,
  productId: string,
  storagePath: string,
  contentType: string,
  bytes: Buffer,
): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  if (!storagePath.startsWith(`products/${productId}/`)) {
    throw new InvalidImageError('Upload path does not belong to this product.');
  }
  await getStorageBucket().file(storagePath).save(bytes, { contentType, resumable: false });
}

/**
 * Called after the client's direct-to-Storage upload completes. Downloads
 * the (≤5MB, already size-capped at upload-URL-issuance time) file back
 * server-side to do what a signed URL alone can't: verify the actual file
 * content (magic bytes via sharp/libvips, not the declared Content-Type —
 * Security.md §9 rule 1), strip EXIF and cap dimensions (rules 4/6 — sharp
 * strips metadata by default unless .withMetadata() is called), then
 * re-upload the validated/processed result before ever recording it as a
 * real product image.
 */
export async function confirmImageUpload(
  user: SessionUser,
  productId: string,
  input: ConfirmImageUploadInput,
): Promise<ProductImageDetail> {
  requireRole(user, ['admin', 'staff']);
  const product = await repo.findProductById(productId);
  if (!product) throw new NotFoundError('Product not found.');

  if (!input.storagePath.startsWith(`products/${productId}/`)) {
    throw new InvalidImageError('Upload path does not belong to this product.');
  }

  const file = getStorageBucket().file(input.storagePath);
  let buffer: Buffer;
  try {
    [buffer] = await file.download();
  } catch {
    throw new InvalidImageError('Upload not found — it may have expired.');
  }

  let format: string | undefined;
  try {
    format = (await sharp(buffer).metadata()).format;
  } catch {
    await file.delete().catch(() => {});
    throw new InvalidImageError();
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    await file.delete().catch(() => {});
    throw new InvalidImageError();
  }

  const processed = await sharp(buffer)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(format as 'jpeg' | 'png' | 'webp')
    .toBuffer();

  await file.save(processed, { contentType: `image/${format}`, resumable: false });

  const sortOrder = await repo.countProductImages(productId);
  const image = await repo.createProductImage({
    productId,
    variantId: input.variantId,
    storagePath: input.storagePath,
    altText: input.altText,
    isPrimary: input.isPrimary,
    sortOrder,
  });

  return toImageDetail(image);
}

export async function reorderImages(
  user: SessionUser,
  productId: string,
  input: ReorderImagesInput,
): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  // Verify every image actually belongs to this product before writing —
  // otherwise a crafted request could reorder another product's images.
  for (const { id } of input.images) {
    const image = await repo.findImageById(id);
    if (!image || image.productId !== productId) {
      throw new NotFoundError('One or more images were not found on this product.');
    }
  }
  await repo.reorderProductImagesRows(input.images);
}

export async function setPrimaryImage(
  user: SessionUser,
  productId: string,
  imageId: string,
): Promise<ProductImageDetail> {
  requireRole(user, ['admin', 'staff']);
  const image = await repo.findImageById(imageId);
  if (!image || image.productId !== productId) throw new NotFoundError('Image not found.');

  const updated = await repo.setPrimaryImageRow(productId, imageId);
  return toImageDetail(updated);
}

export async function deleteImage(
  user: SessionUser,
  productId: string,
  imageId: string,
): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  const image = await repo.findImageById(imageId);
  if (!image || image.productId !== productId) throw new NotFoundError('Image not found.');

  await getStorageBucket()
    .file(image.storagePath)
    .delete()
    .catch(() => {});
  await repo.deleteProductImageRow(imageId);
}
