'use client';

import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toRupeeDisplay } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { ProductGallery } from '@/components/storefront/ProductGallery';
import type { ProductDetail } from '@/modules/catalog/catalog.types';

/** Every attribute key present across this product's variants, e.g. size/color. */
function collectAttributeKeys(product: ProductDetail): string[] {
  const keys = new Set<string>();
  for (const v of product.variants) {
    for (const key of Object.keys(v.attributes)) keys.add(key);
  }
  return [...keys];
}

function uniqueValuesFor(product: ProductDetail, key: string): string[] {
  return [
    ...new Set(product.variants.map((v) => v.attributes[key]).filter((v): v is string => !!v)),
  ];
}

export function ProductDetailView({ product }: { product: ProductDetail }) {
  const attributeKeys = useMemo(() => collectAttributeKeys(product), [product]);
  const firstInStock = product.variants.find((v) => v.inStock) ?? product.variants[0];

  const [selected, setSelected] = useState<Record<string, string>>(
    () => firstInStock?.attributes ?? {},
  );
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = useMemo(
    () =>
      product.variants.find((v) =>
        attributeKeys.every((key) => v.attributes[key] === selected[key]),
      ),
    [product.variants, attributeKeys, selected],
  );

  const displayPrice = selectedVariant?.price ?? product.variants[0]?.price ?? 0;
  const displaySalePrice = selectedVariant?.salePrice ?? product.variants[0]?.salePrice ?? null;
  const inStock = selectedVariant?.inStock ?? false;
  const maxQty = Math.min(selectedVariant?.availableQty ?? 0, 10);

  function selectAttribute(key: string, value: string) {
    setSelected((prev) => ({ ...prev, [key]: value }));
    setQuantity(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col gap-4">
          {product.brand && <p className="text-muted text-sm">{product.brand.name}</p>}
          <h1 className="text-foreground text-2xl font-semibold">{product.name}</h1>

          {product.reviewsSummary.count > 0 && (
            <div className="text-muted flex items-center gap-1.5 text-sm">
              <Star className="fill-accent-500 text-accent-500 h-4 w-4" aria-hidden="true" />
              <span className="text-foreground font-medium">{product.reviewsSummary.average}</span>
              <span>
                ({product.reviewsSummary.count} review
                {product.reviewsSummary.count === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="flex items-baseline gap-3">
            {displaySalePrice ? (
              <>
                <span className="text-foreground text-2xl font-semibold">
                  {toRupeeDisplay(displaySalePrice)}
                </span>
                <span className="text-muted text-base line-through">
                  {toRupeeDisplay(displayPrice)}
                </span>
              </>
            ) : (
              <span className="text-foreground text-2xl font-semibold">
                {toRupeeDisplay(displayPrice)}
              </span>
            )}
          </div>
          {product.gstRate > 0 && (
            <p className="text-muted text-xs">Inclusive of {product.gstRate}% GST</p>
          )}

          {attributeKeys.map((key) => (
            <div key={key}>
              <p className="text-foreground mb-1.5 text-sm font-medium capitalize">{key}</p>
              <div className="flex flex-wrap gap-2">
                {uniqueValuesFor(product, key).map((value) => {
                  const isSelected = selected[key] === value;
                  const wouldBeInStock = product.variants.some(
                    (v) => v.attributes[key] === value && v.inStock,
                  );
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => selectAttribute(key, value)}
                      aria-pressed={isSelected}
                      className={cn(
                        'relative rounded-[10px] border px-4 py-2 text-sm font-medium',
                        isSelected
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-border text-foreground hover:border-primary-600',
                        !wouldBeInStock && 'text-muted',
                      )}
                    >
                      {value}
                      {!wouldBeInStock && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-[10px] bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),var(--color-border)_50%,transparent_calc(50%+1px))]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedVariant && (
            <div>
              <p className="text-foreground mb-1.5 text-sm font-medium">Quantity</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="icon-button border-border text-foreground rounded-[10px] border disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={quantity >= maxQty}
                  title={quantity >= maxQty ? `Only ${maxQty} left` : undefined}
                  className="icon-button border-border text-foreground rounded-[10px] border disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  +
                </button>
                {inStock && maxQty <= 5 && (
                  <span className="text-accent-600 text-xs">Only {maxQty} left</span>
                )}
              </div>
            </div>
          )}

          <div className="mt-2 flex gap-3">
            <Button
              disabled={!inStock}
              title="Cart isn't available yet — coming in the next phase."
              className="flex-1"
            >
              {inStock ? 'Add to Cart' : 'Out of Stock'}
            </Button>
            <Button
              variant="secondary"
              disabled={!inStock}
              title="Checkout isn't available yet — coming in a future phase."
              className="flex-1"
            >
              Buy Now
            </Button>
          </div>

          {product.shortDescription && (
            <p className="text-muted text-sm">{product.shortDescription}</p>
          )}

          {product.description && (
            <details className="border-border rounded-[10px] border">
              <summary className="text-foreground cursor-pointer px-4 py-3 text-sm font-medium">
                Description
              </summary>
              <div className="border-border text-muted border-t px-4 py-3 text-sm whitespace-pre-line">
                {product.description}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
