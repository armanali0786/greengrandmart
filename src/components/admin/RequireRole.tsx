'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SessionUser } from '@/modules/auth/auth.types';

/**
 * Client-side gate for admin pages — same caveat as RequireAuth: this is a
 * UX convenience, not the security boundary (docs/Security.md explicitly
 * rules out custom middleware/cookie auth; see RequireAuth.tsx). Every
 * admin API route independently re-verifies the token and re-reads the role
 * from Postgres (AGENTS.md §3.3) regardless of what this component decides
 * to render.
 */
export function RequireRole({
  allow,
  children,
}: {
  allow: SessionUser['role'][];
  children: ReactNode;
}) {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const { data: user, isLoading: profileLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authFetch<SessionUser>('/api/auth/me'),
    enabled: !!firebaseUser,
  });

  const loading = authLoading || (!!firebaseUser && profileLoading);
  const allowed = !!user && allow.includes(user.role);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
    } else if (user && !allowed) {
      router.replace('/');
    }
  }, [loading, firebaseUser, user, allowed, router]);

  if (loading || !allowed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
