import Link from 'next/link';
import { Leaf } from 'lucide-react';

// Catalog sections (category shortcuts, featured carousel, new arrivals, trust
// strip — docs/UX_UI_Spec.md "Home") land in the Catalog phase once products
// exist to show. This is the hero shell they'll be added around.
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="bg-primary-50 flex flex-col items-center gap-6 rounded-[10px] px-6 py-16 text-center">
        <Leaf className="text-primary-600 h-12 w-12" aria-hidden="true" />
        <h1 className="text-foreground text-3xl font-semibold sm:text-4xl">
          Fresh groceries, delivered.
        </h1>
        <p className="text-muted max-w-xl">
          GreenGrandMart is getting ready to stock its shelves. Create an account to be first in
          line when we open.
        </p>
        <Link
          href="/signup"
          className="bg-primary-600 hover:bg-primary-700 inline-flex h-12 items-center justify-center rounded-[10px] px-6 text-base font-medium text-white"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
