import { ProductCard } from '@/components/storefront/ProductCard';
import type { ProductListItem } from '@/modules/catalog/catalog.types';

/** Horizontally scrollable row — the "featured carousel" / "new arrivals" sections. */
export function ProductRow({ products }: { products: ProductListItem[] }) {
  return (
    <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {products.map((product) => (
        <div key={product.id} className="w-40 shrink-0 sm:w-48">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
