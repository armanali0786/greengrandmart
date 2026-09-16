import type { ReactNode } from 'react';
import { PackageSearch } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCard } from '@/components/storefront/ProductCard';
import type { ProductListItem } from '@/modules/catalog/catalog.types';

export interface ProductGridProps {
  products: ProductListItem[];
  emptyTitle?: string;
  emptyMessage?: string;
  /** e.g. a "Clear filters" link/button, shown only when filters narrowed the result to zero. */
  emptyAction?: ReactNode;
}

// docs/UX_UI_Spec.md §4.2: 2 columns mobile, 4 columns desktop.
export function ProductGrid({
  products,
  emptyTitle = 'No products found',
  emptyMessage = 'No products match your filters.',
  emptyAction,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="border-border bg-surface rounded-[10px] border">
        <EmptyState
          icon={PackageSearch}
          title={emptyTitle}
          description={emptyMessage}
          action={emptyAction}
          compact
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
