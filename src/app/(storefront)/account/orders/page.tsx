'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { orderStatusBadgeClass, orderStatusLabel } from '@/lib/order-status-display';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { OrderSummary } from '@/modules/orders/order.types';

interface OrdersPage {
  items: OrderSummary[];
  total: number;
}

const LIMIT = 20;

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', page],
    queryFn: () => authFetch<OrdersPage>(`/api/orders?page=${page}&limit=${LIMIT}`),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-surface flex items-center justify-between gap-4 rounded-[10px] border p-4"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="border-border bg-surface rounded-[10px] border">
        <EmptyState
          icon={PackageSearch}
          title="No orders yet"
          description="You haven't placed any orders yet — once you do, they'll show up here."
          action={
            <Link href="/products">
              <Button>Start shopping</Button>
            </Link>
          }
          compact
        />
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
      {data.total > LIMIT && (
        <div className="mt-2 flex justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={page * LIMIT >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
