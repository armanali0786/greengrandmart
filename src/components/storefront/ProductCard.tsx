import Image from 'next/image';
import Link from 'next/link';
import { toRupeeDisplay } from '@/lib/money';
import type { ProductListItem } from '@/modules/catalog/catalog.types';

export interface ProductCardProps {
  product: ProductListItem;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group border-border bg-surface flex flex-col overflow-hidden rounded-[10px] border"
    >
      <div className="bg-primary-50 relative aspect-square">
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
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="bg-surface text-foreground rounded-full px-3 py-1 text-xs font-medium">
              Out of stock
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-foreground group-hover:text-primary-700 line-clamp-2 text-sm font-medium">
          {product.name}
        </p>
        <div className="mt-auto flex items-baseline gap-2">
          {product.salePrice ? (
            <>
              <span className="text-foreground text-sm font-semibold">
                {toRupeeDisplay(product.salePrice)}
              </span>
              <span className="text-muted text-xs line-through">
                {toRupeeDisplay(product.basePrice)}
              </span>
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
