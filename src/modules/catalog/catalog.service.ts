import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { getPublicImageUrl } from '@/lib/firebase-storage';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { initializeStock } from '@/modules/inventory/inventory.service';
import { withAudit } from '@/modules/admin/audit';
import * as repo from '@/modules/catalog/catalog.repository';
import type {
  ProductListRow,
  ProductDetailRow,
  CategoryRow,
} from '@/modules/catalog/catalog.repository';
import type {
  ListProductsQuery,
  SearchQuery,
  CreateProductInput,
  UpdateProductInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateBrandInput,
  UpdateBrandInput,
} from '@/modules/catalog/catalog.schema';
import type {
  AdminProductDetail,
  AdminProductListItem,
  BrandSummary,
  CategoryNode,
  PaginatedResult,
  ProductDetail,
  ProductListItem,
  ProductStatus,
  VariantPricingSnapshot,
} from '@/modules/catalog/catalog.types';

function toPaginated<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function toProductListItem(row: ProductListRow): ProductListItem {
  const inStock = row.variants.some((v) => (v.inventory?.availableQty ?? 0) > 0);
  const primaryImage = row.images[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    basePrice: row.basePrice,
    salePrice: row.salePrice,
    primaryImage: primaryImage ? getPublicImageUrl(primaryImage.storagePath) : null,
    inStock,
    isFeatured: row.isFeatured,
  };
}

function toProductDetail(row: ProductDetailRow): ProductDetail {
  const ratings = row.reviews.map((r) => r.rating);
  const average = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDescription: row.shortDescription,
    gstRate: Number(row.gstRate),
    brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug } : null,
    category: row.category
      ? { id: row.category.id, name: row.category.name, slug: row.category.slug }
      : null,
    images: row.images.map((img) => ({
      id: img.id,
      url: getPublicImageUrl(img.storagePath),
      altText: img.altText,
      isPrimary: img.isPrimary,
      variantId: img.variantId,
      sortOrder: img.sortOrder,
    })),
    variants: row.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes as Record<string, string>,
      price: v.price,
      salePrice: v.salePrice,
      inStock: (v.inventory?.availableQty ?? 0) > 0,
      availableQty: v.inventory?.availableQty ?? 0,
    })),
    reviewsSummary: { average: Math.round(average * 10) / 10, count: ratings.length },
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}

function toAdminProductDetail(row: ProductDetailRow): AdminProductDetail {
  return {
    ...toProductDetail(row),
    basePrice: row.basePrice,
    salePrice: row.salePrice,
    hsnCode: row.hsnCode,
    isFeatured: row.isFeatured,
    status: row.status as ProductStatus,
  };
}

function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        slug: r.slug,
        imagePath: r.imagePath ? getPublicImageUrl(r.imagePath) : null,
        children: [],
      },
    ]),
  );
  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parentId && byId.has(row.parentId)) {
      byId.get(row.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ── Public read-side ────────────────────────────────────────────────────

export async function listProducts(
  query: ListProductsQuery,
): Promise<PaginatedResult<ProductListItem>> {
  const { rows, total } = await repo.findManyProducts({
    categorySlug: query.category,
    brandSlug: query.brand,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  });
  return toPaginated(rows.map(toProductListItem), query.page, query.limit, total);
}

export async function searchProducts(
  query: SearchQuery,
): Promise<PaginatedResult<ProductListItem>> {
  const { rows, total } = await repo.searchProducts(query);
  return toPaginated(rows.map(toProductListItem), query.page, query.limit, total);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail> {
  const row = await repo.findProductBySlugForDetail(slug);
  if (!row) throw new NotFoundError('This product is no longer available.');
  return toProductDetail(row);
}

export async function listCategoryTree(): Promise<CategoryNode[]> {
  const rows = await repo.findAllCategories();
  return buildCategoryTree(rows);
}

export async function getCategoryWithProducts(
  slug: string,
  query: Omit<ListProductsQuery, 'category'>,
): Promise<{ category: CategoryRow; products: PaginatedResult<ProductListItem> }> {
  const category = await repo.findCategoryBySlug(slug);
  if (!category) throw new NotFoundError('Category not found.');

  const { rows, total } = await repo.findManyProducts({
    categorySlug: slug,
    brandSlug: query.brand,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  });

  return {
    category,
    products: toPaginated(rows.map(toProductListItem), query.page, query.limit, total),
  };
}

export async function listBrands(): Promise<BrandSummary[]> {
  const rows = await repo.findAllBrands();
  return rows.map((b) => ({ ...b, logoPath: b.logoPath ? getPublicImageUrl(b.logoPath) : null }));
}

export async function listFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  const rows = await repo.findFeaturedProducts(limit);
  return rows.map(toProductListItem);
}

export async function listNewestProducts(limit = 8): Promise<ProductListItem[]> {
  const rows = await repo.findNewestProducts(limit);
  return rows.map(toProductListItem);
}

/** modules/pricing's read into the catalog — see catalog.repository.ts's findVariantsForPricing. */
export async function getVariantsForPricing(
  variantIds: string[],
): Promise<VariantPricingSnapshot[]> {
  if (variantIds.length === 0) return [];
  const rows = await repo.findVariantsForPricing(variantIds);
  return rows.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    attributes: v.attributes as Record<string, string>,
    productId: v.product.id,
    productName: v.product.name,
    categoryId: v.product.categoryId,
    brandId: v.product.brandId,
    price: v.price,
    salePrice: v.salePrice,
    gstRate: Number(v.product.gstRate),
  }));
}

// ── Admin mutations ─────────────────────────────────────────────────────

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function createProduct(
  user: SessionUser,
  input: CreateProductInput,
): Promise<{ id: string; slug: string }> {
  requireRole(user, ['admin', 'staff']);

  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'PRODUCT_CREATED',
      entityType: 'product',
      entityId: (result) => result.id,
      after: (result) => result,
      mutate: () => repo.createProductWithVariants(input, initializeStock),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new ConflictError('This slug or SKU is already in use.', 'slug');
    }
    throw e;
  }
}

export async function updateProduct(
  user: SessionUser,
  id: string,
  input: UpdateProductInput,
): Promise<{ id: string; slug: string }> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findProductById(id);
  if (!before) throw new NotFoundError('Product not found.');

  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: id,
      before: toAdminProductDetail(before),
      mutate: () => repo.updateProductRow(id, input),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      throw new ConflictError('This slug is already in use.', 'slug');
    }
    throw e;
  }
}

/**
 * "Soft-delete (archive) rather than hard delete" per
 * docs/Product_Spec_Requirements.md §13.2 — sets status='archived', doesn't
 * touch deleted_at (reserved for a harder purge path, not exposed here;
 * research brief gap #5).
 */
export async function archiveProduct(user: SessionUser, id: string): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findProductById(id);
  if (!before) throw new NotFoundError('Product not found.');

  await withAudit({
    actorUserId: user.id,
    action: 'PRODUCT_ARCHIVED',
    entityType: 'product',
    entityId: id,
    before: { status: before.status },
    after: () => ({ status: 'archived' }),
    mutate: () => repo.archiveProductRow(id),
  });
}

export async function createCategory(
  user: SessionUser,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  requireRole(user, ['admin', 'staff']);
  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: (result) => result.id,
      after: (result) => result,
      mutate: () => repo.createCategoryRow(input),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new ConflictError('This slug is already in use.', 'slug');
    throw e;
  }
}

export async function updateCategory(
  user: SessionUser,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findCategoryById(id);
  if (!before) throw new NotFoundError('Category not found.');

  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'CATEGORY_UPDATED',
      entityType: 'category',
      entityId: id,
      before,
      after: (result) => result,
      mutate: () => repo.updateCategoryRow(id, input),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new ConflictError('This slug is already in use.', 'slug');
    throw e;
  }
}

export async function deleteCategory(user: SessionUser, id: string): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findCategoryById(id);
  if (!before) throw new NotFoundError('Category not found.');

  await withAudit({
    actorUserId: user.id,
    action: 'CATEGORY_DELETED',
    entityType: 'category',
    entityId: id,
    before,
    after: () => null,
    mutate: () => repo.deleteCategoryRow(id),
  });
}

export async function createBrand(
  user: SessionUser,
  input: CreateBrandInput,
): Promise<BrandSummary> {
  requireRole(user, ['admin', 'staff']);
  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'BRAND_CREATED',
      entityType: 'brand',
      entityId: (result) => result.id,
      after: (result) => result,
      mutate: () => repo.createBrandRow(input),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new ConflictError('This slug is already in use.', 'slug');
    throw e;
  }
}

export async function updateBrand(
  user: SessionUser,
  id: string,
  input: UpdateBrandInput,
): Promise<BrandSummary> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findBrandById(id);
  if (!before) throw new NotFoundError('Brand not found.');

  try {
    return await withAudit({
      actorUserId: user.id,
      action: 'BRAND_UPDATED',
      entityType: 'brand',
      entityId: id,
      before,
      after: (result) => result,
      mutate: () => repo.updateBrandRow(id, input),
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new ConflictError('This slug is already in use.', 'slug');
    throw e;
  }
}

export async function deleteBrand(user: SessionUser, id: string): Promise<void> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findBrandById(id);
  if (!before) throw new NotFoundError('Brand not found.');

  await withAudit({
    actorUserId: user.id,
    action: 'BRAND_DELETED',
    entityType: 'brand',
    entityId: id,
    before,
    after: () => null,
    mutate: () => repo.deleteBrandRow(id),
  });
}

// Admin product/category/brand lookups reuse the same repository the
// public read-side uses — no separate "admin catalog" query layer, since
// the underlying data and shape are identical, only the role check differs.
export async function getProductForAdmin(
  user: SessionUser,
  id: string,
): Promise<AdminProductDetail> {
  requireRole(user, ['admin', 'staff']);
  const row = await repo.findProductById(id);
  if (!row) throw new NotFoundError('Product not found.');
  return toAdminProductDetail(row);
}

export async function listProductsForAdmin(
  user: SessionUser,
  query: Pick<ListProductsQuery, 'category' | 'brand' | 'page' | 'limit'>,
): Promise<PaginatedResult<AdminProductListItem>> {
  requireRole(user, ['admin', 'staff']);
  const { rows, total } = await repo.findManyProductsForAdmin({
    categorySlug: query.category,
    brandSlug: query.brand,
    page: query.page,
    limit: query.limit,
  });
  const items = rows.map((row) => ({
    ...toProductListItem(row),
    status: row.status as ProductStatus,
  }));
  return toPaginated(items, query.page, query.limit, total);
}
