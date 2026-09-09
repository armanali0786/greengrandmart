import type { Metadata } from 'next';
import { listCategoryProductsQuerySchema } from '@/modules/catalog/catalog.schema';
import {
  getCategoryWithProducts,
  listBrands,
  listCategoryTree,
} from '@/modules/catalog/catalog.service';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import {
  DesktopProductFilters,
  MobileProductFilters,
} from '@/components/storefront/ProductFilters';
import { Pagination } from '@/components/storefront/Pagination';

export async function generateMetadata({
  params,
}: PageProps<'/categories/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { category } = await getCategoryWithProducts(slug, { sort: 'newest', page: 1, limit: 1 });
    return { title: category.name };
  } catch {
    return { title: 'Category' };
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<'/categories/[slug]'>) {
  const { slug } = await params;
  const rawQuery = await searchParams;
  const query = listCategoryProductsQuerySchema.parse(rawQuery);

  const [{ category, products }, categories, brands] = await Promise.all([
    getCategoryWithProducts(slug, query),
    listCategoryTree(),
    listBrands(),
  ]);

  function buildHref(targetPage: number): string {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(rawQuery)) {
      if (typeof value === 'string' && key !== 'page') usp.set(key, value);
    }
    usp.set('page', String(targetPage));
    return `/categories/${slug}?${usp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">{category.name}</h1>
        <MobileProductFilters categories={categories} brands={brands} hideCategoryFilter />
      </div>

      <div className="flex gap-8">
        <DesktopProductFilters categories={categories} brands={brands} hideCategoryFilter />
        <div className="min-w-0 flex-1">
          <ProductGrid products={products.items} emptyMessage="No products in this category yet." />
        </div>
      </div>

      <Pagination page={products.page} totalPages={products.totalPages} buildHref={buildHref} />
    </div>
  );
}
