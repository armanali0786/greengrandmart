import Link from 'next/link';
import { Leaf, ShieldCheck, Truck, Undo2 } from 'lucide-react';
import {
  listCategoryTree,
  listFeaturedProducts,
  listNewestProducts,
} from '@/modules/catalog/catalog.service';
import { CategoryShortcuts } from '@/components/storefront/CategoryShortcuts';
import { ProductRow } from '@/components/storefront/ProductRow';

// docs/UX_UI_Spec.md §4.1 Home: hero banner, category shortcuts, featured
// carousel, new arrivals, trust strip. "Empty fallback: category grid +
// all-products link (never blank hero)" — handled below by always rendering
// the hero, and falling back to a plain "browse all" CTA when there are no
// categories/featured products yet rather than an empty section.
export default async function HomePage() {
  const [categories, featured, newest] = await Promise.all([
    listCategoryTree(),
    listFeaturedProducts(8),
    listNewestProducts(8),
  ]);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="bg-primary-50 flex flex-col items-center gap-6 rounded-[10px] px-6 py-16 text-center">
          <Leaf className="text-primary-600 h-12 w-12" aria-hidden="true" />
          <h1 className="text-foreground text-3xl font-semibold sm:text-4xl">
            Fashion & beauty, for every you.
          </h1>
          <p className="text-muted max-w-xl">
            Clothing, beauty, and accessories curated for girls and women — delivered to your door.
          </p>
          <Link
            href="/products"
            className="bg-primary-600 hover:bg-primary-700 inline-flex h-12 items-center justify-center rounded-[10px] px-6 text-base font-medium text-white"
          >
            Shop now
          </Link>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-foreground text-lg font-semibold">Shop by Category</h2>
            <Link
              href="/categories"
              className="text-primary-700 text-sm font-medium hover:underline"
            >
              See all →
            </Link>
          </div>
          <CategoryShortcuts categories={categories} />
        </section>
      )}

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <h2 className="text-foreground mb-4 text-lg font-semibold">Featured</h2>
          <ProductRow products={featured} />
        </section>
      )}

      {newest.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <h2 className="text-foreground mb-4 text-lg font-semibold">New Arrivals</h2>
          <ProductRow products={newest} />
        </section>
      )}

      {categories.length === 0 && featured.length === 0 && newest.length === 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12 text-center sm:px-6">
          <Link href="/products" className="text-primary-700 text-sm font-medium hover:underline">
            Browse all products →
          </Link>
        </section>
      )}

      <section className="border-border bg-surface border-t">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-10 text-center sm:grid-cols-3 sm:px-6">
          <div className="flex flex-col items-center gap-2">
            <Truck className="text-primary-600 h-6 w-6" aria-hidden="true" />
            <p className="text-foreground text-sm font-medium">Fast delivery</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ShieldCheck className="text-primary-600 h-6 w-6" aria-hidden="true" />
            <p className="text-foreground text-sm font-medium">Secure payments</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Undo2 className="text-primary-600 h-6 w-6" aria-hidden="true" />
            <p className="text-foreground text-sm font-medium">Easy returns</p>
          </div>
        </div>
      </section>
    </div>
  );
}
