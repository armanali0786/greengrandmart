import { Spinner } from '@/components/ui/Spinner';

/**
 * Full-page loader — only for Next.js route-level `loading.tsx` files,
 * where the entire route segment is unavailable until server data resolves
 * (App Router shows this automatically during navigation, no wiring
 * needed). Never import this into a client component for a small async
 * call; that belongs to Spinner/Skeleton scoped to just that section.
 */
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner message={message} />
    </div>
  );
}
