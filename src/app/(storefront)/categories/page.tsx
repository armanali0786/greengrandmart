import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { listCategoryTree } from '@/modules/catalog/catalog.service';
import { CategoryTile } from '@/components/storefront/CategoryTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'All Categories' };

// Same reasoning as the home page: admin-editable catalog data must be
// fetched per-request, not baked in at build time.
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const categories = await listCategoryTree();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-foreground mb-6 text-2xl font-semibold">Shop by Category</h1>
      {categories.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {categories.map((category) => (
            <CategoryTile key={category.id} category={category} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={LayoutGrid}
          title="No categories yet"
          description="We're setting things up — check back soon, or browse all products in the meantime."
          action={
            <Link href="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
