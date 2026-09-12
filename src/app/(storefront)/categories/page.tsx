import type { Metadata } from 'next';
import { listCategoryTree } from '@/modules/catalog/catalog.service';
import { CategoryTile } from '@/components/storefront/CategoryTile';

export const metadata: Metadata = { title: 'All Categories' };

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
        <p className="text-muted text-sm">No categories yet.</p>
      )}
    </div>
  );
}
