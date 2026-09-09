import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { RequireRole } from '@/components/admin/RequireRole';

// This is the catalog-management slice of the admin panel only (Products/
// Categories/Brands) — the full shell (dashboard, orders, coupons, refunds,
// audit logs, RBAC-aware sidebar) is docs/ECOMMERCE_IMPLEMENTATION_PLAN.md
// Phase 10 "Admin Panel." Built now because Phase 3 ("image upload to
// Firebase Storage") isn't testable/usable without *some* way to manage
// catalog data — this nav will be absorbed into the full shell later.
const NAV_ITEMS = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/brands', label: 'Brands' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/promotions', label: 'Promotions' },
];

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <RequireRole allow={['admin', 'staff']}>
      <div className="min-h-full">
        <header className="border-border bg-surface border-b">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
            <Link
              href="/admin/products"
              className="text-primary-700 flex shrink-0 items-center gap-2"
            >
              <Leaf className="h-5 w-5" aria-hidden="true" />
              <span className="hidden text-sm font-semibold sm:inline">GreenGrandMart Admin</span>
            </Link>
            <nav className="flex min-w-0 flex-1 gap-3 overflow-x-auto sm:gap-4">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-foreground hover:text-primary-700 shrink-0 text-sm font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/"
              className="text-muted hover:text-foreground shrink-0 text-sm whitespace-nowrap"
            >
              Back to store
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </RequireRole>
  );
}
