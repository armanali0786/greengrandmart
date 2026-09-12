import Link from 'next/link';
import Image from 'next/image';
import { Tag } from 'lucide-react';
import type { CategoryNode } from '@/modules/catalog/catalog.types';

export function CategoryTile({
  category,
  className = '',
}: {
  category: CategoryNode;
  className?: string;
}) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`hover:bg-primary-50 flex flex-col items-center gap-2 rounded-[10px] p-2 text-center ${className}`}
    >
      <div className="bg-primary-50 relative aspect-square w-full overflow-hidden rounded-[10px]">
        {category.imagePath ? (
          <Image
            src={category.imagePath}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Tag className="text-primary-600 h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>
      <span className="text-foreground line-clamp-2 text-xs font-medium">{category.name}</span>
    </Link>
  );
}
