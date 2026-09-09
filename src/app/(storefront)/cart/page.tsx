'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCart, useRemoveCartItem, useUpdateCartItemQuantity } from '@/hooks/useCart';
import { useToast } from '@/components/ui/Toast';
import { CartItemRow } from '@/components/storefront/CartItemRow';
import { CouponInput, type AppliedCoupon } from '@/components/storefront/CouponInput';
import { Button } from '@/components/ui/Button';
import { toRupeeDisplay } from '@/lib/money';

const UNDO_WINDOW_MS = 5000;

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const updateQuantity = useUpdateCartItemQuantity();
  const removeItem = useRemoveCartItem();
  const { show } = useToast();

  // Removal is delayed by UNDO_WINDOW_MS (UX_UI_Spec.md §4.4: "removing an
  // item shows an undo toast for 5 seconds before it's final") — no DELETE
  // is sent until the window elapses, so Undo is a pure client-side cancel,
  // not a real "add it back" request.
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  function cancelPendingRemoval(itemId: string) {
    const timer = timers.current.get(itemId);
    if (timer) clearTimeout(timer);
    timers.current.delete(itemId);
    setPendingRemovalIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  function requestRemove(itemId: string) {
    setPendingRemovalIds((prev) => new Set(prev).add(itemId));
    const timer = setTimeout(() => {
      timers.current.delete(itemId);
      removeItem.mutate(itemId, {
        onSettled: () =>
          setPendingRemovalIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          }),
      });
    }, UNDO_WINDOW_MS);
    timers.current.set(itemId, timer);

    show({
      message: 'Item removed',
      actionLabel: 'Undo',
      duration: UNDO_WINDOW_MS,
      onAction: () => cancelPendingRemoval(itemId),
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="bg-primary-50 h-64 animate-pulse rounded-[10px]" />
      </div>
    );
  }

  const visibleItems = (cart?.items ?? []).filter((i) => !pendingRemovalIds.has(i.id));
  const subtotal = visibleItems.reduce((sum, i) => sum + i.currentPrice * i.quantity, 0);
  const hasUnavailable = visibleItems.some((i) => !i.available);

  if (visibleItems.length === 0) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        <ShoppingBag className="text-muted h-12 w-12" aria-hidden="true" />
        <h1 className="text-foreground text-xl font-semibold">Your cart is empty</h1>
        <p className="text-muted text-sm">Looks like you haven&apos;t added anything yet.</p>
        <Link href="/products">
          <Button>Browse products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-foreground mb-6 text-2xl font-semibold">Your Cart</h1>
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="border-border bg-surface rounded-[10px] border px-4">
          {visibleItems.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              syncing={updateQuantity.isPending && updateQuantity.variables?.itemId === item.id}
              onQuantityChange={(itemId, quantity) => updateQuantity.mutate({ itemId, quantity })}
              onRemove={requestRemove}
            />
          ))}
        </div>

        <div className="border-border bg-surface flex h-fit flex-col gap-4 rounded-[10px] border p-4">
          <h2 className="text-foreground text-base font-semibold">Order Summary</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="text-foreground font-medium">{toRupeeDisplay(subtotal)}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-sm">
              <span className="text-muted">Coupon ({appliedCoupon.code})</span>
              <span className="text-primary-700 font-medium">
                −{toRupeeDisplay(appliedCoupon.estimatedDiscount)}
              </span>
            </div>
          )}
          <CouponInput applied={appliedCoupon} onApply={setAppliedCoupon} />
          <p className="text-muted text-xs">
            Estimate only — promotions, exact tax, and shipping are confirmed at checkout.
          </p>
          {hasUnavailable && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-xs">
              Some items are unavailable — remove them to continue.
            </p>
          )}
          {hasUnavailable ? (
            <Button
              disabled
              title="Remove unavailable items before proceeding to checkout."
              className="w-full"
            >
              Proceed to Checkout
            </Button>
          ) : (
            <Link href="/checkout">
              <Button className="w-full">Proceed to Checkout</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
