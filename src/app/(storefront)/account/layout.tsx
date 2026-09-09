import { RequireAuth } from '@/components/storefront/RequireAuth';
import { AccountNav } from '@/components/storefront/AccountNav';

export default function AccountLayout({ children }: LayoutProps<'/account'>) {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-foreground mb-6 text-2xl font-semibold">My account</h1>
        <div className="flex flex-col gap-8 sm:flex-row">
          <AccountNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </RequireAuth>
  );
}
