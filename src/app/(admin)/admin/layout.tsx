import { RequireRole } from '@/components/admin/RequireRole';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// This is the catalog-management slice of the admin panel only (Products/
// Categories/Brands) — the full shell (dashboard, orders, coupons, refunds,
// audit logs, RBAC-aware sidebar) is docs/ECOMMERCE_IMPLEMENTATION_PLAN.md
// Phase 10 "Admin Panel." Built now because Phase 3 ("image upload to
// Firebase Storage") isn't testable/usable without *some* way to manage
// catalog data — this nav will be absorbed into the full shell later.
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <RequireRole allow={['admin', 'staff']}>
      <div className="min-h-full sm:flex">
        <header className="border-border bg-surface border-b sm:sticky sm:top-0 sm:h-screen sm:w-56 sm:shrink-0 sm:border-r sm:border-b-0">
          <AdminSidebar />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </RequireRole>
  );
}
