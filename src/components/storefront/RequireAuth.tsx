'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Client-side gate for pages that require sign-in (account pages now; admin
 * pages will use a role-checking variant of this same pattern once built —
 * Phase 10). This is a UX convenience, NOT the security boundary: per
 * docs/Security.md, the app deliberately has no custom session/cookie logic
 * for server-side (middleware) auth checks — every API route independently
 * re-verifies the Firebase token and re-reads the role from Postgres
 * (AGENTS.md §3.3), which is the real enforcement.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.replace('/login');
    }
  }, [loading, firebaseUser, router]);

  if (loading || !firebaseUser) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
