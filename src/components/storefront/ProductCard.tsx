import Image from 'next/image';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { toRupeeDisplay } from '@/lib/money';
import type { ProductListItem } from '@/modules/catalog/catalog.types';

export interface ProductCardProps {
  product: ProductListItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const discountPct =
    product.salePrice && product.basePrice > 0
      ? Math.round((1 - product.salePrice / product.basePrice) * 100)
      : null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group border-border bg-surface flex flex-col overflow-hidden rounded-[10px] border"
    >
      <div className="bg-primary-50 relative aspect-[3/4]">
        {product.primaryImage ? (
          <Image
            src={product.primaryImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="text-muted flex h-full items-center justify-center text-sm">No image</div>
        )}
        {discountPct !== null && discountPct > 0 && (
          <span className="bg-accent-600 absolute top-2 left-2 rounded-[6px] px-1.5 py-0.5 text-xs font-semibold text-white">
            {discountPct}% OFF
          </span>
        )}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="bg-surface text-foreground rounded-full px-3 py-1 text-xs font-medium">
              Out of stock
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.brandName && (
          <span className="text-foreground text-xs font-bold tracking-wide uppercase">
            {product.brandName}
          </span>
        )}
        <p className="text-muted group-hover:text-primary-700 line-clamp-2 text-sm">
          {product.name}
        </p>
        {product.reviewCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="bg-primary-600 flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 text-xs font-medium text-white">
              {product.rating}
              <Star className="h-3 w-3 fill-white" aria-hidden="true" />
            </span>
            <span className="text-muted text-xs">({product.reviewCount})</span>
          </div>
        )}
        <div className="mt-auto flex items-baseline gap-2">
          {product.salePrice ? (
            <>
              <span className="text-foreground text-sm font-semibold">
                {toRupeeDisplay(product.salePrice)}
              </span>
              <span className="text-muted text-xs line-through">
                {toRupeeDisplay(product.basePrice)}
              </span>
              {discountPct !== null && discountPct > 0 && (
                <span className="text-success text-xs font-medium">{discountPct}% off</span>
              )}
            </>
          ) : (
            <span className="text-foreground text-sm font-semibold">
              {toRupeeDisplay(product.basePrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
