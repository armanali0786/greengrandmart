'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { orderStatusBadgeClass, orderStatusLabel } from '@/lib/order-status-display';
import type { OrderSummary } from '@/modules/orders/order.types';

interface OrdersPage {
  items: OrderSummary[];
  total: number;
}

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => authFetch<OrdersPage>('/api/orders?limit=50'),
  });

  if (isLoading) {
    return <div className="bg-primary-50 h-48 animate-pulse rounded-[10px]" />;
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-[10px] border px-4 py-16 text-center">
        <PackageSearch className="text-muted h-10 w-10" aria-hidden="true" />
        <p className="text-foreground font-medium">No orders yet</p>
        <Link href="/products" className="text-primary-700 text-sm font-medium hover:underline">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.items.map((order) => (
        <Link
          key={order.id}
          href={`/account/orders/${order.id}`}
          className="border-border bg-surface hover:border-primary-600 flex items-center justify-between gap-4 rounded-[10px] border p-4"
        >
          <div>
            <p className="text-foreground text-sm font-medium">{order.orderNumber}</p>
            <p className="text-muted text-xs">
              {new Date(order.placedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}{' '}
              · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
              {order.firstItemName ? ` · ${order.firstItemName}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
            >
              {orderStatusLabel(order.status)}
            </span>
            <span className="text-foreground text-sm font-semibold">
              {toRupeeDisplay(order.grandTotal)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
