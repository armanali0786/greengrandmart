import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-10 pb-12">
      <Skeleton className="h-64 w-full rounded-none sm:h-80" />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
