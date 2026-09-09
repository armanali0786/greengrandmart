'use client';

import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { Leaf, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Storefront top bar. Per docs/UX_UI_Spec.md "Navigation", the full picture
 * is a mobile bottom tab bar (Home | Categories | Cart | Account) plus a top
 * bar with search + notification bell, and a desktop top bar adding a
 * Categories dropdown, Wishlist, and Cart badge. Those items are added here
 * as their features land (catalog, cart, wishlist, notifications) rather
 * than linking to pages that don't exist yet — this phase only has Home and
 * account auth state to show.
 */
export function Header() {
  const { firebaseUser, loading } = useAuth();

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
  }

  return (
    <header className="border-border bg-surface sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-primary-700 flex items-center gap-2">
          <Leaf className="h-6 w-6" aria-hidden="true" />
          <span className="text-lg font-semibold">GreenGrandMart</span>
        </Link>

        <nav className="flex items-center gap-3">
          {loading ? (
            <div className="bg-primary-50 h-9 w-20 animate-pulse rounded-[10px]" />
          ) : firebaseUser ? (
            <>
              <Link
                href="/account"
                className="text-foreground hover:text-primary-700 flex items-center gap-1.5 text-sm font-medium"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {firebaseUser.displayName || firebaseUser.email}
                </span>
              </Link>
              <Button variant="secondary" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-foreground hover:text-primary-700 text-sm font-medium"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={cn(
                  'bg-primary-600 hover:bg-primary-700 inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-sm font-medium text-white',
                )}
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
