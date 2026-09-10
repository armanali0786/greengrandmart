import { Skeleton } from '@/components/ui/Skeleton';

/** Mirrors ProductGrid/ProductCard's layout so the route transition doesn't jump. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="border-border bg-surface overflow-hidden rounded-[10px] border">
          <Skeleton className="aspect-square rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
