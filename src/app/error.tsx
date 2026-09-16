'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Catches any unhandled error thrown while rendering a page or its nested
// layouts below the root layout (e.g. a DB/Prisma failure, a thrown
// NotFoundError variant that wasn't meant to reach here, a network blip) —
// without this, Next.js falls back to its bare/dev overlay error screen
// instead of a branded, recoverable one.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-24 text-center sm:px-6">
      <AlertTriangle className="text-error h-12 w-12" aria-hidden="true" />
      <h1 className="text-foreground text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted text-sm">
        We hit a problem loading this page. Please try again, or head back home.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/">
          <Button variant="secondary">Go home</Button>
        </Link>
      </div>
    </div>
  );
}
