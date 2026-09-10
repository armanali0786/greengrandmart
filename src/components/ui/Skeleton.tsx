import { cn } from '@/lib/cn';

/**
 * Generic placeholder block for skeleton loading states — content whose
 * approximate layout is already known (cards, rows, form fields), so the
 * shape itself communicates "loading" without needing a message. Compose
 * with utility classes for size/shape (`h-4 w-32`, `h-48 rounded-[10px]`,
 * `rounded-full` for avatars, etc.) rather than adding size variants here.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('bg-primary-50 animate-pulse rounded-[10px]', className)}
    />
  );
}
