import Link from 'next/link';
import Image from 'next/image';
import { Tag } from 'lucide-react';
import type { CategoryNode } from '@/modules/catalog/catalog.types';

export function CategoryShortcuts({ categories }: { categories: CategoryNode[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/categories/${category.slug}`}
          className="hover:bg-primary-50 flex flex-col items-center gap-2 rounded-[10px] p-3 text-center"
        >
          <div className="bg-primary-50 relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full">
            {category.imagePath ? (
              <Image src={category.imagePath} alt="" fill sizes="64px" className="object-cover" />
            ) : (
              <Tag className="text-primary-600 h-6 w-6" aria-hidden="true" />
            )}
          </div>
          <span className="text-foreground text-xs font-medium">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
