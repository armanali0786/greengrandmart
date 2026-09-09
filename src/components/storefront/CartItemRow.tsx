'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import { toRupeeDisplay } from '@/lib/money';
import type { CartItemView } from '@/modules/cart/cart.types';

export interface CartItemRowProps {
  item: CartItemView;
  syncing: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

const QUANTITY_DEBOUNCE_MS = 500;

/**
 * docs/UX_UI_Spec.md §4.4: "quantity changes debounce and show a small
 * spinner on the line item while syncing" — local state updates instantly
 * for a responsive stepper, the actual PATCH request only fires after the
 * user pauses.
 */
export function CartItemRow({ item, syncing, onQuantityChange, onRemove }: CartItemRowProps) {
  const [localQty, setLocalQty] = useState(item.quantity);
  // Reconciles localQty with a server-confirmed item.quantity change (e.g.
  // after the debounced PATCH settles) without an effect — React's own
  // recommended "adjust state during rendering" pattern for this, since
  // setState directly inside an effect body causes an extra cascading
  // render for no benefit here.
  const [syncedQty, setSyncedQty] = useState(item.quantity);
  if (item.quantity !== syncedQty) {
    setSyncedQty(item.quantity);
    setLocalQty(item.quantity);
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function changeQty(next: number) {
    if (next < 1) return;
    setLocalQty(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onQuantityChange(item.id, next), QUANTITY_DEBOUNCE_MS);
  }

  return (
    <div className="border-border flex gap-4 border-b py-4 last:border-b-0">
      <Link
        href={`/products/${item.productSlug}`}
        className="bg-primary-50 relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px]"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.productName}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="text-muted flex h-full items-center justify-center text-xs">No image</div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              href={`/products/${item.productSlug}`}
              className="text-foreground text-sm font-medium hover:underline"
            >
              {item.productName}
            </Link>
            {Object.keys(item.attributes).length > 0 && (
              <p className="text-muted text-xs">
                {Object.entries(item.attributes)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove item"
            className="icon-button text-muted hover:text-error shrink-0"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!item.available && (
          <p className="text-error text-xs">No longer available — please remove this item.</p>
        )}
        {item.available && item.priceChanged && (
          <p className="text-accent-600 text-xs">
            Price updated to {toRupeeDisplay(item.currentPrice)}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeQty(localQty - 1)}
              disabled={localQty <= 1}
              className="icon-button border-border text-foreground rounded-[10px] border disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium">{localQty}</span>
            <button
              type="button"
              onClick={() => changeQty(localQty + 1)}
              className="icon-button border-border text-foreground rounded-[10px] border"
              aria-label="Increase quantity"
            >
              +
            </button>
            {syncing && <Loader2 className="text-muted h-4 w-4 animate-spin" aria-hidden="true" />}
          </div>
          <span className="text-foreground text-sm font-semibold">
            {toRupeeDisplay(item.currentPrice * localQty)}
          </span>
        </div>
      </div>
    </div>
  );
}
