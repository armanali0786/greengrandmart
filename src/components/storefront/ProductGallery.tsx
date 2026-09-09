'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import type { ProductImageDetail } from '@/modules/catalog/catalog.types';

export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageDetail[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  if (images.length === 0) {
    return (
      <div className="bg-primary-50 text-muted flex aspect-square items-center justify-center rounded-[10px] text-sm">
        No image available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Swipeable on mobile via horizontal scroll-snap; thumbnail strip below on all sizes. */}
      <div className="bg-primary-50 relative aspect-square overflow-hidden rounded-[10px]">
        <Image
          src={active.url}
          alt={active.altText || productName}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === activeIndex}
              className={cn(
                'bg-primary-50 relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border-2',
                i === activeIndex ? 'border-primary-600' : 'border-transparent',
              )}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
