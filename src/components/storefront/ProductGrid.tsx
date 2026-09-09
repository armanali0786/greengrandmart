import { PackageSearch } from 'lucide-react';
import { ProductCard } from '@/components/storefront/ProductCard';
import type { ProductListItem } from '@/modules/catalog/catalog.types';

export interface ProductGridProps {
  products: ProductListItem[];
  emptyMessage?: string;
}

// docs/UX_UI_Spec.md §4.2: 2 columns mobile, 4 columns desktop.
export function ProductGrid({
  products,
  emptyMessage = 'No products match your filters.',
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-[10px] border px-6 py-16 text-center">
        <PackageSearch className="text-muted h-10 w-10" aria-hidden="true" />
        <p className="text-muted text-sm">{emptyMessage}</p>
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
