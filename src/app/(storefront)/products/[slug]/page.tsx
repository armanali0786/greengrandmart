import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug } from '@/modules/catalog/catalog.service';
import { NotFoundError } from '@/lib/errors';
import { ProductDetailView } from '@/components/storefront/ProductDetailView';

async function loadProduct(slug: string) {
  try {
    return await getProductBySlug(slug);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: 'Product' };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
  };
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  // docs/UX_UI_Spec.md §4.3: "Product fully unavailable/archived: page shows
  // 'This product is no longer available' + link back to category, not a
  // broken page" — Next's notFound() renders our not-found.tsx, which
  // satisfies exactly that (see src/app/(storefront)/not-found.tsx).
  if (!product) notFound();

  return <ProductDetailView product={product} />;
}
