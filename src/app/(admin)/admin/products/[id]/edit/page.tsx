'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import {
  ProductForm,
  attributesToText,
  type ProductFormValues,
} from '@/components/admin/ProductForm';
import { ProductImageManager } from '@/components/admin/ProductImageManager';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  CategoryNode,
  BrandSummary,
  AdminProductDetail,
} from '@/modules/catalog/catalog.types';
import type { UpdateProductInput } from '@/modules/catalog/catalog.schema';

export default function EditProductPage({ params }: PageProps<'/admin/products/[id]/edit'>) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ['admin', 'products', id],
    queryFn: () => authFetch<AdminProductDetail>(`/api/admin/products/${id}`),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => authFetch<CategoryNode[]>('/api/admin/categories'),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => authFetch<BrandSummary[]>('/api/admin/brands'),
  });

  async function handleSubmit(input: UpdateProductInput) {
    setError(null);
    setSaved(false);
    try {
      await authFetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'products', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    }
  }

  if (productLoading || !categories || !brands || !product) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="mb-6 h-8 w-40" />
        <div className="mb-8">
          <Skeleton className="mb-4 h-5 w-16" />
          <Skeleton className="h-32 w-full" />
        </div>
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

  const defaultValues: Partial<ProductFormValues> = {
    name: product.name,
    slug: product.slug,
    categoryId: product.category?.id,
    brandId: product.brand?.id,
    shortDescription: product.shortDescription ?? undefined,
    description: product.description ?? undefined,
    basePrice: product.basePrice / 100,
    salePrice: product.salePrice ? product.salePrice / 100 : undefined,
    gstRate: product.gstRate,
    hsnCode: product.hsnCode ?? undefined,
    isFeatured: product.isFeatured,
    status: product.status === 'archived' ? 'draft' : product.status,
    seoTitle: product.seoTitle ?? undefined,
    seoDescription: product.seoDescription ?? undefined,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      attributesText: attributesToText(v.attributes),
      price: v.price / 100,
      salePrice: v.salePrice ? v.salePrice / 100 : undefined,
      initialStock: v.availableQty,
    })),
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-foreground mb-6 text-2xl font-semibold">Edit product</h1>

      <section className="mb-8">
        <h2 className="text-foreground mb-4 text-base font-semibold">Images</h2>
        <ProductImageManager productId={id} />
      </section>

      {saved && (
        <p
          role="status"
          className="bg-primary-50 text-primary-700 mb-4 rounded-[10px] px-3 py-2 text-sm"
        >
          Saved.
        </p>
      )}
      {error && (
        <p role="alert" className="bg-error-bg text-error mb-4 rounded-[10px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <ProductForm
        categories={categories}
        brands={brands}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        lockStock
      />
    </div>
  );
}
