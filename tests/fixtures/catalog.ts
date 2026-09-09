import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export interface CreateTestVariantOptions {
  price?: number;
  salePrice?: number;
  gstRate?: number;
  categoryId?: string;
  brandId?: string;
}

export async function createTestVariant(
  initialQty = 10,
  opts: CreateTestVariantOptions = {},
): Promise<{ productId: string; variantId: string }> {
  const suffix = randomUUID();
  const price = opts.price ?? 10000;
  const product = await db.product.create({
    data: {
      name: `Test Product ${suffix}`,
      slug: `test-product-${suffix}`,
      status: 'active',
      basePrice: price,
      gstRate: opts.gstRate ?? 0,
      categoryId: opts.categoryId,
      brandId: opts.brandId,
      variants: {
        create: {
          sku: `TEST-SKU-${suffix}`,
          price,
          salePrice: opts.salePrice,
          inventory: { create: { availableQty: initialQty } },
        },
      },
    },
    include: { variants: true },
  });
  return { productId: product.id, variantId: product.variants[0].id };
}

export async function createTestCategory(): Promise<{ id: string }> {
  const suffix = randomUUID();
  return db.category.create({
    data: { name: `Test Category ${suffix}`, slug: `test-category-${suffix}` },
    select: { id: true },
  });
}

export async function deleteTestCategory(id: string): Promise<void> {
  await db.category.delete({ where: { id } }).catch(() => {});
}

export async function createTestBrand(): Promise<{ id: string }> {
  const suffix = randomUUID();
  return db.brand.create({
    data: { name: `Test Brand ${suffix}`, slug: `test-brand-${suffix}` },
    select: { id: true },
  });
}

export async function deleteTestBrand(id: string): Promise<void> {
  await db.brand.delete({ where: { id } }).catch(() => {});
}

/**
 * inventory_reservations/inventory_movements/cart_items all reference
 * product_variants with ON DELETE RESTRICT (never CASCADE — a real
 * stock-history record, or someone's cart line, must never silently
 * disappear), so test cleanup has to clear those itself before the product
 * (and its variant, via CASCADE) can be deleted.
 */
export async function deleteTestProduct(productId: string): Promise<void> {
  const variants = await db.productVariant.findMany({
    where: { productId },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);
  if (variantIds.length > 0) {
    await db.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await db.inventoryReservation.deleteMany({ where: { variantId: { in: variantIds } } });
    await db.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
  }
  await db.product.delete({ where: { id: productId } }).catch(() => {});
}
