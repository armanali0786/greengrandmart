'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { CategoryNode } from '@/modules/catalog/catalog.types';
import type { BrandSummary } from '@/modules/catalog/catalog.types';

export interface ProductFiltersProps {
  categories: CategoryNode[];
  brands: BrandSummary[];
  /** Hidden when already scoped to a category page (docs/API_Spec.md GET /categories/:slug). */
  hideCategoryFilter?: boolean;
}

interface Draft {
  category: string;
  brand: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  sort: string;
}

function flattenCategories(nodes: CategoryNode[], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((n) => [
    { slug: n.slug, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

function buildQueryString(draft: Draft): string {
  const params = new URLSearchParams();
  if (draft.category) params.set('category', draft.category);
  if (draft.brand) params.set('brand', draft.brand);
  if (draft.minPrice) params.set('minPrice', draft.minPrice);
  if (draft.maxPrice) params.set('maxPrice', draft.maxPrice);
  if (draft.inStock) params.set('inStock', 'true');
  if (draft.sort && draft.sort !== 'newest') params.set('sort', draft.sort);
  return params.toString();
}

function useFilterState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const draftFromUrl = (): Draft => ({
    category: searchParams.get('category') ?? '',
    brand: searchParams.get('brand') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
    inStock: searchParams.get('inStock') === 'true',
    sort: searchParams.get('sort') ?? 'newest',
  });

  function apply(draft: Draft) {
    router.push(`${pathname}?${buildQueryString(draft)}`);
  }

  return { key: searchParams.toString(), draftFromUrl, apply };
}

/**
 * The sidebar variant — place inside the two-column content row alongside
 * the product grid (desktop only; renders nothing at mobile widths).
 */
export function DesktopProductFilters({
  categories,
  brands,
  hideCategoryFilter,
}: ProductFiltersProps) {
  const { key, draftFromUrl, apply } = useFilterState();
  const flatCategories = flattenCategories(categories);

  return (
    <div className="hidden w-56 shrink-0 flex-col gap-6 md:flex">
      <DesktopFilters
        key={key} // reset local draft when the URL changes elsewhere (e.g. Pagination)
        initialDraft={draftFromUrl()}
        onApply={apply}
        categories={flatCategories}
        brands={brands}
        hideCategoryFilter={hideCategoryFilter}
      />
    </div>
  );
}

/**
 * The "Filters" button + drawer variant — place in the page header next to
 * the title (mobile only; renders nothing at desktop widths).
 */
export function MobileProductFilters({
  categories,
  brands,
  hideCategoryFilter,
}: ProductFiltersProps) {
  const { key, draftFromUrl, apply } = useFilterState();
  const flatCategories = flattenCategories(categories);

  return (
    <MobileFilterDrawer
      key={key}
      initialDraft={draftFromUrl()}
      onApply={apply}
      categories={flatCategories}
      brands={brands}
      hideCategoryFilter={hideCategoryFilter}
    />
  );
}

/** "Applies immediately" (docs/UX_UI_Spec.md §4.2) — but debounced, and with
 * its own local draft state so a typed price digit shows up in the input
 * right away instead of waiting on navigation to re-derive it from the URL. */
function DesktopFilters({
  initialDraft,
  onApply,
  categories,
  brands,
  hideCategoryFilter,
}: {
  initialDraft: Draft;
  onApply: (draft: Draft) => void;
  categories: { slug: string; label: string }[];
  brands: BrandSummary[];
  hideCategoryFilter?: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function handleChange(next: Draft) {
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onApply(next), 400);
  }

  return (
    <FilterControls
      draft={draft}
      onChange={handleChange}
      categories={categories}
      brands={brands}
      hideCategoryFilter={hideCategoryFilter}
    />
  );
}

function MobileFilterDrawer({
  initialDraft,
  onApply,
  categories,
  brands,
  hideCategoryFilter,
}: {
  initialDraft: Draft;
  onApply: (draft: Draft) => void;
  categories: { slug: string; label: string }[];
  brands: BrandSummary[];
  hideCategoryFilter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialDraft);

  return (
    <div className="md:hidden">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setDraft(initialDraft);
          setOpen(true);
        }}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filters
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Filters">
        <FilterControls
          draft={draft}
          onChange={setDraft}
          categories={categories}
          brands={brands}
          hideCategoryFilter={hideCategoryFilter}
        />
        <Button
          className="mt-6 w-full"
          onClick={() => {
            onApply(draft);
            setOpen(false);
          }}
        >
          Show results
        </Button>
      </Modal>
    </div>
  );
}

function FilterControls({
  draft,
  onChange,
  categories,
  brands,
  hideCategoryFilter,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  categories: { slug: string; label: string }[];
  brands: BrandSummary[];
  hideCategoryFilter?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="sort" className="text-foreground mb-1 block text-sm font-medium">
          Sort by
        </label>
        <select
          id="sort"
          value={draft.sort}
          onChange={(e) => onChange({ ...draft, sort: e.target.value })}
          className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="popularity">Popularity</option>
        </select>
      </div>

      {!hideCategoryFilter && (
        <div>
          <label htmlFor="category" className="text-foreground mb-1 block text-sm font-medium">
            Category
          </label>
          <select
            id="category"
            value={draft.category}
            onChange={(e) => onChange({ ...draft, category: e.target.value })}
            className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="brand" className="text-foreground mb-1 block text-sm font-medium">
          Brand
        </label>
        <select
          id="brand"
          value={draft.brand}
          onChange={(e) => onChange({ ...draft, brand: e.target.value })}
          className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-foreground mb-1 block text-sm font-medium">Price (₹)</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            aria-label="Minimum price"
            placeholder="Min"
            value={draft.minPrice}
            onChange={(e) => onChange({ ...draft, minPrice: e.target.value })}
            className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
          />
          <span className="text-muted">–</span>
          <input
            type="number"
            min={0}
            aria-label="Maximum price"
            placeholder="Max"
            value={draft.maxPrice}
            onChange={(e) => onChange({ ...draft, maxPrice: e.target.value })}
            className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
          />
        </div>
      </div>

      <label className="text-foreground flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={draft.inStock}
          onChange={(e) => onChange({ ...draft, inStock: e.target.checked })}
        />
        In stock only
      </label>
    </div>
  );
}
