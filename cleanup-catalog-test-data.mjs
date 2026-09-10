import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');
const hasDigits = (s) => /\d{3,}/.test(s);

const products = await db.product.findMany({ where: {}, select: { id: true, name: true } });
const targetProducts = products.filter((p) => hasDigits(p.name));
const targetProductIds = targetProducts.map((p) => p.id);

const categories = await db.category.findMany({ select: { id: true, name: true } });
const targetCategories = categories.filter((c) => hasDigits(c.name));
const targetCategoryIds = targetCategories.map((c) => c.id);

const brands = await db.brand.findMany({ select: { id: true, name: true } });
const targetBrands = brands.filter((b) => hasDigits(b.name));
const targetBrandIds = targetBrands.map((b) => b.id);

console.log(`Products to delete: ${targetProductIds.length}`);
console.log(`Categories to delete: ${targetCategoryIds.length}`);
console.log(`Brands to delete: ${targetBrandIds.length}`);

if (DRY_RUN) {
  console.log('Dry run — no changes made.');
  await db.$disconnect();
  process.exit(0);
}

if (targetProductIds.length > 0) {
  const variants = await db.productVariant.findMany({
    where: { productId: { in: targetProductIds } },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);

  if (variantIds.length > 0) {
    const cartItems = await db.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    console.log(`Deleted ${cartItems.count} stale cart items referencing test variants.`);
    const reservations = await db.inventoryReservation.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    console.log(`Deleted ${reservations.count} stale inventory reservations referencing test variants.`);
  }

  // Cascades ProductVariant -> Inventory + ProductImage automatically.
  const { count: productDeleteCount } = await db.product.deleteMany({
    where: { id: { in: targetProductIds } },
  });
  console.log(`Deleted ${productDeleteCount} test products (cascaded variants/images/inventory).`);
}

if (targetCategoryIds.length > 0) {
  const { count } = await db.category.deleteMany({ where: { id: { in: targetCategoryIds } } });
  console.log(`Deleted ${count} test categories.`);
}

if (targetBrandIds.length > 0) {
  const { count } = await db.brand.deleteMany({ where: { id: { in: targetBrandIds } } });
  console.log(`Deleted ${count} test brands.`);
}

await db.$disconnect();
