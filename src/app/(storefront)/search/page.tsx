import type { Metadata } from 'next';
import Link from 'next/link';
import { searchQuerySchema } from '@/modules/catalog/catalog.schema';
import { searchProducts } from '@/modules/catalog/catalog.service';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { Pagination } from '@/components/storefront/Pagination';
import { SearchBar } from '@/components/storefront/SearchBar';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const rawQuery = await searchParams;
  const q = typeof rawQuery.q === 'string' ? rawQuery.q : '';

  const result = q
    ? await searchProducts(searchQuerySchema.parse(rawQuery))
    : { items: [], page: 1, limit: 24, total: 0, totalPages: 1 };

  function buildHref(targetPage: number): string {
    const usp = new URLSearchParams({ q });
    usp.set('page', String(targetPage));
    return `/search?${usp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 max-w-md">
        <SearchBar initialValue={q} />
      </div>

      {q && (
        <p className="text-muted mb-4 text-sm">
          {result.total} result{result.total === 1 ? '' : 's'} for &ldquo;{q}&rdquo;
        </p>
      )}

      <ProductGrid
        products={result.items}
        emptyTitle={q ? `No results for "${q}"` : 'Search for products'}
        emptyMessage={
          q
            ? "We couldn't find anything matching your search. Try a different term or browse categories instead."
            : 'Type something above to find products.'
        }
        emptyAction={
          q ? (
            <Link href="/categories">
              <Button variant="secondary" size="sm">
                Browse categories
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Pagination page={result.page} totalPages={result.totalPages} buildHref={buildHref} />
    </div>
  );
}
