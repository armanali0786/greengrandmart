import type { Metadata } from 'next';
import { listProductsQuerySchema } from '@/modules/catalog/catalog.schema';
import { listBrands, listCategoryTree, listProducts } from '@/modules/catalog/catalog.service';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import {
  DesktopProductFilters,
  MobileProductFilters,
} from '@/components/storefront/ProductFilters';
import { Pagination } from '@/components/storefront/Pagination';

export const metadata: Metadata = { title: 'All Products' };

export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  const params = await searchParams;
  const query = listProductsQuerySchema.parse(params);

  const [{ items, page, totalPages }, categories, brands] = await Promise.all([
    listProducts(query),
    listCategoryTree(),
    listBrands(),
  ]);

  function buildHref(targetPage: number): string {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && key !== 'page') usp.set(key, value);
    }
    usp.set('page', String(targetPage));
    return `/products?${usp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">All Products</h1>
        <MobileProductFilters categories={categories} brands={brands} />
      </div>

      <div className="flex gap-8">
        <DesktopProductFilters categories={categories} brands={brands} />
        <div className="min-w-0 flex-1">
          <ProductGrid products={items} />
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
