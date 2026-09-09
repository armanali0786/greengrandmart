'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { AdminProductListItem, PaginatedResult } from '@/modules/catalog/catalog.types';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted/20 text-muted',
  active: 'bg-primary-50 text-primary-700',
  archived: 'bg-error-bg text-error',
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () =>
      authFetch<PaginatedResult<AdminProductListItem>>('/api/admin/products?limit=100'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      setArchivingId(null);
    },
  });

  const archivingProduct = data?.items.find((p) => p.id === archivingId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">Products</h1>
        <Link href="/admin/products/new">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New product
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-primary-50 h-64 animate-pulse rounded-[10px]" />
      ) : !data || data.items.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No products yet.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => (
                <tr key={product.id} className="border-border border-b last:border-0">
                  <td className="flex items-center gap-3 px-4 py-3">
                    <div className="bg-primary-50 relative h-10 w-10 shrink-0 overflow-hidden rounded-[6px]">
                      {product.primaryImage && (
                        <Image
                          src={product.primaryImage}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <span className="text-foreground font-medium">{product.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {toRupeeDisplay(product.salePrice ?? product.basePrice)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[product.status]}`}
                    >
                      {product.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{product.inStock ? 'In stock' : 'Out of stock'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/products/${product.id}/edit`}>
                        <Button variant="secondary" size="sm">
                          Edit
                        </Button>
                      </Link>
                      {product.status !== 'archived' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchivingId(product.id)}
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!archivingProduct}
        onClose={() => setArchivingId(null)}
        onConfirm={() => archiveMutation.mutateAsync(archivingProduct!.id).then(() => {})}
        title="Archive this product?"
        description={`"${archivingProduct?.name}" will be hidden from the storefront. It can't be un-archived from here.`}
        confirmLabel="Archive"
      />
    </div>
  );
}
