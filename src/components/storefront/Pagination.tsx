import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given page, preserving other query params. */
  buildHref: (page: number) => string;
}

// No client JS needed — plain links let the Server Component page above it
// re-render for the new page via normal navigation (Coding_Standards.md §7:
// URL-driven state, not client state).
export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={cn(
          'rounded-[10px] px-3 py-2 text-sm font-medium',
          page === 1 ? 'text-muted/50 pointer-events-none' : 'text-foreground hover:bg-primary-50',
        )}
      >
        Previous
      </Link>

      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="text-muted px-1">…</span>}
          <Link
            href={buildHref(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'min-w-[2.25rem] rounded-[10px] px-3 py-2 text-center text-sm font-medium',
              p === page ? 'bg-primary-600 text-white' : 'text-foreground hover:bg-primary-50',
            )}
          >
            {p}
          </Link>
        </span>
      ))}

      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={cn(
          'rounded-[10px] px-3 py-2 text-sm font-medium',
          page === totalPages
            ? 'text-muted/50 pointer-events-none'
            : 'text-foreground hover:bg-primary-50',
        )}
      >
        Next
      </Link>
    </nav>
  );
}
