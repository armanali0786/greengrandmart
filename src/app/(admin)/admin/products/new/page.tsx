'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { useState } from 'react';
import { ProductForm } from '@/components/admin/ProductForm';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import type { CreateProductInput } from '@/modules/catalog/catalog.schema';

export default function NewProductPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => authFetch<CategoryNode[]>('/api/admin/categories'),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => authFetch<BrandSummary[]>('/api/admin/brands'),
  });

  async function handleSubmit(input: CreateProductInput) {
    setError(null);
    try {
      const product = await authFetch<{ id: string }>('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      router.push(`/admin/products/${product.id}/edit`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  if (!categories || !brands) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="mb-6 h-8 w-40" />
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-foreground mb-6 text-2xl font-semibold">New product</h1>
      <p className="text-muted mb-6 text-sm">You can add images after saving.</p>
      {error && (
        <p role="alert" className="bg-error-bg text-error mb-4 rounded-[10px] px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <ProductForm
        categories={categories}
        brands={brands}
        onSubmit={handleSubmit}
        submitLabel="Create product"
      />
    </div>
  );
}
