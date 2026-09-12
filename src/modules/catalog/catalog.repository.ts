import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type {
  ListProductsQuery,
  SearchQuery,
  UpdateProductInput,
} from '@/modules/catalog/catalog.schema';

type TxClient = Prisma.TransactionClient;

// Every listing/detail query needs the same shape (images + variants +
// their inventory) — centralized so list and detail queries can't drift.
const productListInclude = {
  images: { where: { isPrimary: true }, take: 1 },
  variants: { include: { inventory: true } },
  brand: { select: { name: true } },
  reviews: { where: { status: 'approved' }, select: { rating: true } },
} satisfies Prisma.ProductInclude;

const productDetailInclude = {
  brand: true,
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: { include: { inventory: true } },
  reviews: { where: { status: 'approved' }, select: { rating: true } },
} satisfies Prisma.ProductInclude;

export type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;
export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

/**
 * Effective/display price is salePrice when set, else basePrice — filtering
 * matches this everywhere price range is involved.
 */
function priceRangeWhere(minPrice?: number, maxPrice?: number): Prisma.ProductWhereInput {
  if (minPrice === undefined && maxPrice === undefined) return {};
  const range: Prisma.IntFilter = {};
  if (minPrice !== undefined) range.gte = minPrice;
  if (maxPrice !== undefined) range.lte = maxPrice;
  return {
    OR: [{ salePrice: range }, { AND: [{ salePrice: null }, { basePrice: range }] }],
  };
}

function inStockWhere(inStock?: boolean): Prisma.ProductWhereInput {
  if (inStock === undefined) return {};
  const some = { inventory: { availableQty: { gt: 0 } } };
  return inStock ? { variants: { some } } : { NOT: { variants: { some } } };
}

// price_asc/price_desc sort on basePrice, not the true salePrice-aware
// effective price — Prisma can't order by a COALESCE without raw SQL, and
// exact price-sort precision isn't worth that at this catalog size (~500
// products per docs/PRD.md). A documented simplification, not an oversight.
function sortOrderBy(sort: ListProductsQuery['sort']): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'popularity':
      return { orderItems: { _count: 'desc' } };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

interface ListProductsParams {
  categorySlug?: string;
  brandSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort: ListProductsQuery['sort'];
  page: number;
  limit: number;
}

async function resolveCategoryId(slug?: string): Promise<string | undefined> {
  if (!slug) return undefined;
  const category = await db.category.findUnique({ where: { slug }, select: { id: true } });
  return category?.id;
}

async function resolveBrandId(slug?: string): Promise<string | undefined> {
  if (!slug) return undefined;
  const brand = await db.brand.findUnique({ where: { slug }, select: { id: true } });
  return brand?.id;
}

export async function findManyProducts(
  params: ListProductsParams,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const [categoryId, brandId] = await Promise.all([
    resolveCategoryId(params.categorySlug),
    resolveBrandId(params.brandSlug),
  ]);

  // A category/brand filter was given but didn't resolve to a real row —
  // no products can match; skip the query rather than returning everything.
  if ((params.categorySlug && !categoryId) || (params.brandSlug && !brandId)) {
    return { rows: [], total: 0 };
  }

  const where: Prisma.ProductWhereInput = {
    status: 'active',
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
    ...priceRangeWhere(params.minPrice, params.maxPrice),
    ...inStockWhere(params.inStock),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: productListInclude,
      orderBy: sortOrderBy(params.sort),
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.product.count({ where }),
  ]);

  return { rows, total };
}

/**
 * search_vector is mapped as `Unsupported("tsvector")` in schema.prisma
 * (it's trigger-maintained, not Prisma-managed — see catalog module's
 * comment history / Data_Model_DB_Schema.md addendum), so Prisma's normal
 * query builder can't filter or order by it. Raw SQL is required here;
 * `plainto_tsquery` is passed as a bound parameter through Prisma's tagged
 * template (`Prisma.sql`), not string-concatenated, so this isn't
 * SQL-injectable despite being raw. Two-step: get ranked, paginated IDs via
 * raw SQL, then re-fetch full rows via the normal Prisma include shape and
 * restore the rank order (findMany with `id: {in}}` doesn't preserve order).
 */
export async function findFeaturedProducts(limit: number): Promise<ProductListRow[]> {
  return db.product.findMany({
    where: { status: 'active', deletedAt: null, isFeatured: true },
    include: productListInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function findNewestProducts(limit: number): Promise<ProductListRow[]> {
  return db.product.findMany({
    where: { status: 'active', deletedAt: null },
    include: productListInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function searchProducts(
  query: SearchQuery,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const offset = (query.page - 1) * query.limit;

  const [matches, countResult] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE status = 'active' AND deleted_at IS NULL
        AND search_vector @@ plainto_tsquery('english', ${query.q})
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${query.q})) DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `,
    db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM products
      WHERE status = 'active' AND deleted_at IS NULL
        AND search_vector @@ plainto_tsquery('english', ${query.q})
    `,
  ]);

  const ids = matches.map((m) => m.id);
  if (ids.length === 0) return { rows: [], total: 0 };

  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    include: productListInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is ProductListRow => !!r);

  return { rows: ordered, total: Number(countResult[0]?.count ?? 0) };
}

/**
 * Admin listing (no status filter — drafts/archived must be visible to the
 * people managing them, unlike the public listing above).
 */
export async function findManyProductsForAdmin(params: {
  categorySlug?: string;
  brandSlug?: string;
  page: number;
  limit: number;
}): Promise<{ rows: ProductListRow[]; total: number }> {
  const [categoryId, brandId] = await Promise.all([
    resolveCategoryId(params.categorySlug),
    resolveBrandId(params.brandSlug),
  ]);
  if ((params.categorySlug && !categoryId) || (params.brandSlug && !brandId)) {
    return { rows: [], total: 0 };
  }

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: productListInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.product.count({ where }),
  ]);
  return { rows, total };
}

export async function findProductBySlugForDetail(slug: string): Promise<ProductDetailRow | null> {
  return db.product.findFirst({
    where: { slug, status: 'active', deletedAt: null },
    include: productDetailInclude,
  });
}

export async function findProductById(id: string): Promise<ProductDetailRow | null> {
  return db.product.findUnique({ where: { id }, include: productDetailInclude });
}

// ── Category tree ──────────────────────────────────────────────────────

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  imagePath: string | null;
}

export async function findAllCategories(): Promise<CategoryRow[]> {
  return db.category.findMany({ orderBy: { name: 'asc' } });
}

export async function findCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  return db.category.findUnique({ where: { slug } });
}

export async function findCategoryById(id: string): Promise<CategoryRow | null> {
  return db.category.findUnique({ where: { id } });
}

export async function createCategoryRow(data: Prisma.CategoryCreateInput): Promise<CategoryRow> {
  return db.category.create({ data });
}

export async function updateCategoryRow(
  id: string,
  data: Prisma.CategoryUpdateInput,
): Promise<CategoryRow> {
  return db.category.update({ where: { id }, data });
}

export async function deleteCategoryRow(id: string): Promise<void> {
  await db.category.delete({ where: { id } });
}

// ── Brands ──────────────────────────────────────────────────────────────

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
}

export async function findAllBrands(): Promise<BrandRow[]> {
  return db.brand.findMany({ orderBy: { name: 'asc' } });
}

export async function findBrandById(id: string): Promise<BrandRow | null> {
  return db.brand.findUnique({ where: { id } });
}

export async function createBrandRow(data: Prisma.BrandCreateInput): Promise<BrandRow> {
  return db.brand.create({ data });
}

export async function updateBrandRow(id: string, data: Prisma.BrandUpdateInput): Promise<BrandRow> {
  return db.brand.update({ where: { id }, data });
}

export async function deleteBrandRow(id: string): Promise<void> {
  await db.brand.delete({ where: { id } });
}

// ── Product mutations (admin) ──────────────────────────────────────────

export interface ProductCreateData {
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  categoryId?: string;
  brandId?: string;
  basePrice: number;
  salePrice?: number;
  gstRate: number;
  hsnCode?: string;
  isFeatured: boolean;
  seoTitle?: string;
  seoDescription?: string;
  status: 'draft' | 'active';
  variants: {
    sku: string;
    attributes: Record<string, string>;
    price: number;
    salePrice?: number;
    initialStock: number;
  }[];
}

/**
 * Creates the product, its variants, and each variant's inventory row in one
 * transaction — a product is never left half-created if any part fails.
 * `initializeStock` is called through modules/inventory (not written here
 * directly), per AGENTS.md §3.4 / §2 module-boundary rules.
 */
export async function createProductWithVariants(
  data: ProductCreateData,
  onVariantCreated: (tx: TxClient, variantId: string, initialQty: number) => Promise<void>,
): Promise<{ id: string; slug: string }> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        shortDescription: data.shortDescription,
        categoryId: data.categoryId,
        brandId: data.brandId,
        basePrice: data.basePrice,
        salePrice: data.salePrice,
        gstRate: data.gstRate,
        hsnCode: data.hsnCode,
        isFeatured: data.isFeatured,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        status: data.status,
      },
    });

    for (const variant of data.variants) {
      const created = await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: variant.sku,
          attributes: variant.attributes,
          price: variant.price,
          salePrice: variant.salePrice,
        },
      });
      await onVariantCreated(tx, created.id, variant.initialStock);
    }

    return { id: product.id, slug: product.slug };
  });
}

export async function updateProductRow(
  id: string,
  data: UpdateProductInput,
): Promise<{ id: string; slug: string }> {
  const { variants, ...productData } = data;
  return db.$transaction(async (tx) => {
    const result = await tx.product.update({
      where: { id },
      data: productData,
      select: { id: true, slug: true },
    });
    if (variants?.length) {
      // Scoped to this product's id too — a stray/forged variant id from
      // another product can't be updated through this endpoint.
      for (const v of variants) {
        if (!v.id) continue;
        await tx.productVariant.updateMany({
          where: { id: v.id, productId: id },
          data: { attributes: v.attributes, price: v.price, salePrice: v.salePrice ?? null },
        });
      }
    }
    return result;
  });
}

export async function archiveProductRow(id: string): Promise<void> {
  await db.product.update({ where: { id }, data: { status: 'archived' } });
}

// ── Images ──────────────────────────────────────────────────────────────

export interface ProductImageRow {
  id: string;
  productId: string;
  variantId: string | null;
  storagePath: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export async function findImageById(id: string): Promise<ProductImageRow | null> {
  return db.productImage.findUnique({ where: { id } });
}

export async function createProductImage(params: {
  productId: string;
  variantId?: string;
  storagePath: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}): Promise<ProductImageRow> {
  return db.$transaction(async (tx) => {
    if (params.isPrimary) {
      await tx.productImage.updateMany({
        where: { productId: params.productId },
        data: { isPrimary: false },
      });
    }
    return tx.productImage.create({
      data: {
        productId: params.productId,
        variantId: params.variantId,
        storagePath: params.storagePath,
        altText: params.altText,
        isPrimary: params.isPrimary,
        sortOrder: params.sortOrder,
      },
    });
  });
}

export async function countProductImages(productId: string): Promise<number> {
  return db.productImage.count({ where: { productId } });
}

export async function reorderProductImagesRows(
  updates: { id: string; sortOrder: number }[],
): Promise<void> {
  await db.$transaction(
    updates.map((u) =>
      db.productImage.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } }),
    ),
  );
}

export async function deleteProductImageRow(id: string): Promise<void> {
  await db.productImage.delete({ where: { id } });
}

export async function setPrimaryImageRow(
  productId: string,
  imageId: string,
): Promise<ProductImageRow> {
  return db.$transaction(async (tx) => {
    await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
    return tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
  });
}

export interface VariantPricingRow {
  id: string;
  sku: string;
  attributes: Prisma.JsonValue;
  price: number;
  salePrice: number | null;
  product: {
    id: string;
    name: string;
    categoryId: string | null;
    brandId: string | null;
    gstRate: Prisma.Decimal;
  };
}

/**
 * Everything the pricing module needs to price a set of cart lines — never
 * trusts a client-sent price, always re-reads live from here. Exposed via
 * catalog.service.ts per the module-boundary rule (cross-module imports go
 * through .service.ts only), not called directly from modules/pricing.
 */
export async function findVariantsForPricing(variantIds: string[]): Promise<VariantPricingRow[]> {
  return db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      sku: true,
      attributes: true,
      price: true,
      salePrice: true,
      product: {
        select: { id: true, name: true, categoryId: true, brandId: true, gstRate: true },
      },
    },
  });
}
