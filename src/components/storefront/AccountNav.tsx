'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

// Wishlist and Notifications (docs/UX_UI_Spec.md §4.8 sub-screens) are
// linked here as their own phases land — no dead links to unbuilt pages.
const NAV_ITEMS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/security', label: 'Security' },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="border-border flex gap-1 overflow-x-auto border-b sm:flex-col sm:gap-0.5 sm:border-r sm:border-b-0 sm:pr-4">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'shrink-0 rounded-[10px] px-3 py-2 text-sm font-medium whitespace-nowrap',
              active ? 'bg-primary-50 text-primary-700' : 'text-muted hover:bg-primary-50/50',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
