import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export async function createTestVariant(
  initialQty = 10,
): Promise<{ productId: string; variantId: string }> {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: {
      name: `Test Product ${suffix}`,
      slug: `test-product-${suffix}`,
      status: 'active',
      basePrice: 10000,
      variants: {
        create: {
          sku: `TEST-SKU-${suffix}`,
          price: 10000,
          inventory: { create: { availableQty: initialQty } },
        },
      },
    },
    include: { variants: true },
  });
  return { productId: product.id, variantId: product.variants[0].id };
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
