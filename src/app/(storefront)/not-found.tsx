import Link from 'next/link';
import { PackageX } from 'lucide-react';

// docs/UX_UI_Spec.md §4.3: an unavailable/archived product (or any other
// missing storefront page) shows a specific message + a way back, not a
// broken page.
export default function StorefrontNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <PackageX className="text-muted h-12 w-12" aria-hidden="true" />
      <h1 className="text-foreground text-xl font-semibold">This product is no longer available</h1>
      <p className="text-muted text-sm">It may have been removed or the link may be out of date.</p>
      <Link
        href="/products"
        className="bg-primary-600 hover:bg-primary-700 inline-flex h-11 items-center justify-center rounded-[10px] px-6 text-sm font-medium text-white"
      >
        Browse all products
      </Link>
    </div>
  );
}
