'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Leaf, Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/brands', label: 'Brands' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/returns', label: 'Returns' },
  { href: '/admin/refunds', label: 'Refunds' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/jobs', label: 'Jobs' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`rounded-[10px] px-3 py-2.5 text-sm font-medium sm:py-2 ${
              active ? 'bg-primary-50 text-primary-700' : 'text-foreground hover:bg-primary-50/60'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/**
 * A vertical sidebar on sm+ screens. Below sm, a fixed-width sidebar (or the
 * old horizontally-scrolling top bar this replaced — 10 items plus "Back to
 * store" don't fit a narrow screen without getting visually cut off) gives
 * way to a slim top bar with a hamburger that opens a full-height drawer,
 * the standard mobile pattern for a nav this long.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between px-4 py-3 sm:hidden">
        <Link href="/admin/products" className="text-primary-700 flex items-center gap-2">
          <Leaf className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold">GreenGrandMart Admin</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={open}
          className="icon-button text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="bg-surface absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-xl"
          >
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <span className="text-primary-700 flex items-center gap-2 text-sm font-semibold">
                <Leaf className="h-5 w-5" aria-hidden="true" />
                GreenGrandMart Admin
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="icon-button text-foreground"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="text-muted hover:text-foreground border-border border-t px-4 py-4 text-sm"
            >
              ← Back to store
            </Link>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden sm:flex sm:h-full sm:flex-col">
        <Link
          href="/admin/products"
          className="text-primary-700 flex shrink-0 items-center gap-2 px-5 py-4"
        >
          <Leaf className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold">GreenGrandMart Admin</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          <NavLinks pathname={pathname} />
        </nav>
        <Link
          href="/"
          className="text-muted hover:text-foreground border-border shrink-0 border-t px-5 py-4 text-sm"
        >
          ← Back to store
        </Link>
      </div>
    </>
  );
}
