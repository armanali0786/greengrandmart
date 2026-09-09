'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from 'lucide-react';
import { authFetch, ApiError } from '@/lib/api-client';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { Button } from '@/components/ui/Button';
import type { ProductImageDetail } from '@/modules/catalog/catalog.types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function ProductImageManager({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: images, isLoading } = useQuery({
    queryKey: ['admin', 'products', productId],
    queryFn: () => authFetch<{ images: ProductImageDetail[] }>(`/api/admin/products/${productId}`),
    select: (data) => data.images,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'products', productId] });

  const deleteMutation = useMutation({
    mutationFn: (imageId: string) =>
      authFetch(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { images: { id: string; sortOrder: number }[] }) =>
      authFetch(`/api/admin/products/${productId}/images/reorder`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (imageId: string) =>
      authFetch(`/api/admin/products/${productId}/images/${imageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      }),
    onSuccess: invalidate,
  });

  function move(index: number, direction: -1 | 1) {
    if (!images) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderMutation.mutate({ images: reordered.map((img, i) => ({ id: img.id, sortOrder: i })) });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Images must be 5MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const { uploadUrl, storagePath } = await authFetch<{
        uploadUrl: string;
        storagePath: string;
      }>(`/api/admin/products/${productId}/images/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });

      // A real signed URL is self-authorizing and needs no header; our own
      // dev-upload fallback route (local emulator only — see
      // image-upload.service.ts) is same-origin and needs a Bearer token
      // like every other API route.
      const isOwnOrigin = uploadUrl.startsWith('/');
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          ...(isOwnOrigin && {
            Authorization: `Bearer ${await getFirebaseAuth().currentUser?.getIdToken()}`,
          }),
        },
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to storage failed.');

      await authFetch(`/api/admin/products/${productId}/images`, {
        method: 'POST',
        body: JSON.stringify({ storagePath, isPrimary: !images || images.length === 0 }),
      });
      invalidate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <div className="bg-primary-50 h-24 animate-pulse rounded-[10px]" />;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images?.map((image, index) => (
          <div
            key={image.id}
            className="border-border relative overflow-hidden rounded-[10px] border"
          >
            <div className="bg-primary-50 relative aspect-square">
              <Image
                src={image.url}
                alt={image.altText ?? ''}
                fill
                sizes="150px"
                className="object-cover"
              />
              {image.isPrimary && (
                <span className="bg-primary-600 absolute top-1 left-1 rounded-full p-1 text-white">
                  <Star className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move earlier"
                className="icon-button text-muted disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              {!image.isPrimary && (
                <button
                  type="button"
                  onClick={() => setPrimaryMutation.mutate(image.id)}
                  className="text-primary-700 text-xs font-medium hover:underline"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteMutation.mutate(image.id)}
                aria-label="Delete image"
                className="icon-button text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === images.length - 1}
                aria-label="Move later"
                className="icon-button text-muted disabled:opacity-30"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        variant="secondary"
        loading={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="w-fit"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Upload image
      </Button>
    </div>
  );
}
