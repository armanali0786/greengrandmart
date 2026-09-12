import { CategoryTile } from '@/components/storefront/CategoryTile';
import type { CategoryNode } from '@/modules/catalog/catalog.types';

/** Single-row, horizontally scrollable strip — see docs/UX_UI_Spec.md §4.1 "category shortcuts". */
export function CategoryShortcuts({ categories }: { categories: CategoryNode[] }) {
  return (
    <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {categories.map((category) => (
        <CategoryTile key={category.id} category={category} className="w-24 shrink-0 sm:w-28" />
      ))}
    </div>
  );
}
