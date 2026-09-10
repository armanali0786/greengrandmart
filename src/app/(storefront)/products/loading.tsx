import { Skeleton } from '@/components/ui/Skeleton';
import { ProductGridSkeleton } from '@/components/storefront/ProductGridSkeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex gap-8">
        <div className="hidden w-56 shrink-0 flex-col gap-4 lg:flex">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}
