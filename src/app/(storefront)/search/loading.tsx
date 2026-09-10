import { Skeleton } from '@/components/ui/Skeleton';
import { ProductGridSkeleton } from '@/components/storefront/ProductGridSkeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Skeleton className="mb-6 h-8 w-56" />
      <ProductGridSkeleton />
    </div>
  );
}
