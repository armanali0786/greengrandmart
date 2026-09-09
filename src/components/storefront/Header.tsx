'use client';

import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { Leaf, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/storefront/SearchBar';
import { cn } from '@/lib/cn';

/**
 * Storefront top bar. Per docs/UX_UI_Spec.md "Navigation", the full picture
 * also has a mobile bottom tab bar (Home | Categories | Cart | Account) and
 * a desktop Categories dropdown, Wishlist, notification bell, and Cart
 * badge — added here as those features land (cart, wishlist, notifications)
 * rather than linking to pages that don't exist yet.
 */
export function Header() {
  const { firebaseUser, loading } = useAuth();

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
  }

  return (
    <header className="border-border bg-surface sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="text-primary-700 flex shrink-0 items-center gap-2">
          <Leaf className="h-6 w-6" aria-hidden="true" />
          <span className="hidden text-lg font-semibold sm:inline">GreenGrandMart</span>
        </Link>

        <Link
          href="/products"
          className="text-foreground hover:text-primary-700 hidden shrink-0 text-sm font-medium md:inline"
        >
          All Products
        </Link>

        <div className="min-w-0 flex-1">
          <SearchBar />
        </div>

        <nav className="flex shrink-0 items-center gap-3">
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
                className="text-foreground hover:text-primary-700 shrink-0 text-sm font-medium"
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

      {/* Products link is desktop-only above; mobile gets it in a second row */}
      <div className="border-border border-t px-4 py-2 md:hidden">
        <Link href="/products" className="text-foreground text-sm font-medium">
          All Products
        </Link>
      </div>
    </header>
  );
}
