'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { useCart } from '@/hooks/useCart';
import { toRupeeDisplay } from '@/lib/money';
import { cn } from '@/lib/cn';
import { CouponInput, type AppliedCoupon } from '@/components/storefront/CouponInput';
import { Button } from '@/components/ui/Button';
import type { AddressRecord } from '@/modules/auth/address.repository';
import type { OrderTotalBreakdown } from '@/modules/pricing/pricing.types';

// docs/UX_UI_Spec.md §4.5: single sectioned page (address → payment method
// → coupon → summary), not a multi-step wizard. COD is shown but disabled
// — Product_Spec_Requirements.md §5.1 requires phone OTP verification
// before a COD order can be placed, and OTP (MSG91) is Phase 9's job; the
// "online" path alone is what /checkout accepts this phase (order.schema.ts).
export default function CheckoutPage() {
  const router = useRouter();
  const { data: cart, isLoading: cartLoading } = useCart();
  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => authFetch<AddressRecord[]>('/api/addresses'),
  });

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);

  // Default to the shipping address once addresses load — React's own
  // "adjust state during rendering" pattern (a ref of what we've already
  // defaulted from) rather than an effect, since setState directly in an
  // effect body causes an extra cascading render for no benefit here.
  const [defaultedFrom, setDefaultedFrom] = useState<AddressRecord[] | undefined>(undefined);
  if (addresses && addresses !== defaultedFrom && !selectedAddressId) {
    setDefaultedFrom(addresses);
    const preferred = addresses.find((a) => a.isDefaultShipping) ?? addresses[0];
    if (preferred) setSelectedAddressId(preferred.id);
  }

  // TanStack Query, not a manual useEffect+fetch — refetches automatically
  // whenever the address or coupon changes (they're part of the query key),
  // and owns its own loading/error state instead of hand-rolled ones.
  const {
    data: displayQuote,
    isFetching: quoteLoading,
    error: quoteQueryError,
  } = useQuery({
    queryKey: ['checkout-quote', selectedAddressId, appliedCoupon?.code ?? null],
    queryFn: () =>
      authFetch<OrderTotalBreakdown>('/api/checkout/quote', {
        method: 'POST',
        body: JSON.stringify({
          shippingAddressId: selectedAddressId,
          ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        }),
      }),
    enabled: !!selectedAddressId,
  });
  const quoteError = quoteQueryError
    ? quoteQueryError instanceof ApiError
      ? quoteQueryError.message
      : 'Could not calculate totals.'
    : null;

  const placeOrder = useMutation({
    mutationFn: () =>
      authFetch<{ orderId: string }>('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          shippingAddressId: selectedAddressId,
          paymentMethod: 'online',
          ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        }),
      }),
    onSuccess: (result) => router.push(`/account/orders/${result.orderId}`),
    onError: (e) =>
      setPlaceError(e instanceof ApiError ? e.message : 'Could not place your order.'),
  });

  if (cartLoading || addressesLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="bg-primary-50 h-96 animate-pulse rounded-[10px]" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <p className="text-foreground mb-4 font-medium">Your cart is empty.</p>
        <Link href="/products">
          <Button>Browse products</Button>
        </Link>
      </div>
    );
  }

  const hasUnavailable = cart.items.some((i) => !i.available);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-foreground mb-6 text-2xl font-semibold">Checkout</h1>
      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="border-border bg-surface rounded-[10px] border p-4">
            <h2 className="text-foreground mb-3 text-base font-semibold">Shipping address</h2>
            {!addresses || addresses.length === 0 ? (
              <p className="text-muted text-sm">
                You don&apos;t have any saved addresses yet.{' '}
                <Link href="/account/addresses" className="text-primary-700 hover:underline">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cn(
                      'border-border flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 text-sm',
                      selectedAddressId === address.id && 'border-primary-600 bg-primary-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="shippingAddress"
                      className="mt-1"
                      checked={selectedAddressId === address.id}
                      onChange={() => setSelectedAddressId(address.id)}
                    />
                    <span>
                      <span className="text-foreground block font-medium">{address.name}</span>
                      <span className="text-muted block">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state}{' '}
                        {address.postalCode}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="border-border bg-surface rounded-[10px] border p-4">
            <h2 className="text-foreground mb-3 text-base font-semibold">Payment method</h2>
            <div className="flex flex-col gap-2">
              <label className="border-primary-600 bg-primary-50 flex items-center gap-3 rounded-[10px] border p-3 text-sm">
                <input type="radio" checked readOnly />
                <span className="text-foreground font-medium">
                  Online (cards, UPI, netbanking, wallets)
                </span>
              </label>
              <label
                className="border-border flex items-center gap-3 rounded-[10px] border p-3 text-sm opacity-50"
                title="Cash on Delivery isn't available yet — coming in a future phase."
              >
                <input type="radio" disabled />
                <span className="text-muted">Cash on Delivery</span>
              </label>
            </div>
          </section>

          <section className="border-border bg-surface rounded-[10px] border p-4">
            <h2 className="text-foreground mb-3 text-base font-semibold">Coupon</h2>
            <CouponInput applied={appliedCoupon} onApply={setAppliedCoupon} />
          </section>
        </div>

        <div className="border-border bg-surface flex h-fit flex-col gap-3 rounded-[10px] border p-4">
          <h2 className="text-foreground text-base font-semibold">Order summary</h2>
          {quoteLoading && <div className="bg-primary-50 h-40 animate-pulse rounded-[10px]" />}
          {quoteError && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
              {quoteError}
            </p>
          )}
          {displayQuote && !quoteLoading && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="text-foreground">{toRupeeDisplay(displayQuote.subtotal)}</span>
              </div>
              {displayQuote.productDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Promotion discount</span>
                  <span className="text-primary-700">
                    −{toRupeeDisplay(displayQuote.productDiscount)}
                  </span>
                </div>
              )}
              {displayQuote.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Coupon discount</span>
                  <span className="text-primary-700">
                    −{toRupeeDisplay(displayQuote.couponDiscount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted">Shipping</span>
                <span className="text-foreground">{toRupeeDisplay(displayQuote.shippingFee)}</span>
              </div>
              {displayQuote.cgst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">CGST</span>
                  <span className="text-foreground">{toRupeeDisplay(displayQuote.cgst)}</span>
                </div>
              )}
              {displayQuote.sgst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">SGST</span>
                  <span className="text-foreground">{toRupeeDisplay(displayQuote.sgst)}</span>
                </div>
              )}
              {displayQuote.igst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">IGST</span>
                  <span className="text-foreground">{toRupeeDisplay(displayQuote.igst)}</span>
                </div>
              )}
              <div className="border-border mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{toRupeeDisplay(displayQuote.grandTotal)}</span>
              </div>
            </>
          )}
          {hasUnavailable && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-xs">
              Some items in your cart are unavailable — go back to your cart to fix this before
              placing your order.
            </p>
          )}
          {placeError && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
              {placeError}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!selectedAddressId || !displayQuote || hasUnavailable}
            loading={placeOrder.isPending}
            onClick={() => placeOrder.mutate()}
          >
            {displayQuote ? `Pay ${toRupeeDisplay(displayQuote.grandTotal)}` : 'Place Order'}
          </Button>
        </div>
      </div>
    </div>
  );
}
