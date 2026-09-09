import type { PricingScope } from '@/modules/pricing/pricing.types';

/** Shared by coupon eligibility and promotion application — both scope the same way. */
export function matchesScope(
  scope: PricingScope,
  item: { productId: string; categoryId: string | null; brandId: string | null },
): boolean {
  switch (scope.scope) {
    case 'all':
      return true;
    case 'products':
      return scope.productIds.includes(item.productId);
    case 'categories':
      return item.categoryId !== null && scope.categoryIds.includes(item.categoryId);
    case 'brands':
      return item.brandId !== null && scope.brandIds.includes(item.brandId);
  }
}
