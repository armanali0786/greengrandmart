import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.');

// Query params arrive as strings — z.coerce.boolean() would treat the
// literal string "false" as truthy, so booleans in querystrings need an
// explicit enum+transform rather than z.coerce.boolean().
const queryBooleanSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// docs/API_Spec.md §3: GET /products?category=&brand=&minPrice=&maxPrice=&inStock=&sort=&page=&limit=
// Sort literal beyond `price_asc` aren't given verbatim in the docs (see
// Phase 3 research brief gap #8) — `price_desc`/`newest`/`popularity` chosen
// to match the prose in Product_Spec_Requirements.md §2.1 ("price asc/desc,
// newest, popularity").
export const listProductsQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  inStock: queryBooleanSchema,
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popularity']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  // Performance.md: listing page size capped at 100, default 24.
  limit: z.coerce.number().int().positive().max(100).default(24),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Performance.md §7: search query length capped at 200 chars.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const listCategoryProductsQuerySchema = listProductsQuerySchema.omit({ category: true });

// ── Admin mutations ─────────────────────────────────────────────────────

const variantInputSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  attributes: z.record(z.string(), z.string()).default({}),
  price: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().optional(),
  // Not itemized in API_Spec.md's POST /admin/products example (research
  // brief gap #9) — variants need a starting stock level to be sellable at
  // all, so this creates the 1:1 inventory row via modules/inventory at
  // product-creation time; defaults to 0 (unlisted-for-sale until stocked).
  initialStock: z.number().int().nonnegative().default(0),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: slugSchema,
  description: z.string().max(20000).optional(),
  shortDescription: z.string().max(500).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  basePrice: z.number().int().nonnegative(),
  salePrice: z.number().int().nonnegative().optional(),
  gstRate: z.number().min(0).max(100).default(0),
  hsnCode: z.string().trim().max(20).optional(),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  // 'archived' is deliberately not a creatable status — only DELETE
  // /admin/products/:id sets it (research brief gap #5: archived vs
  // deleted_at). draft/active only here.
  status: z.enum(['draft', 'active']).default('draft'),
  variants: z.array(variantInputSchema).default([]),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// No PATCH example body exists in API_Spec.md (research brief gap #4) —
// implemented as the same shape, fully optional, minus `variants` (variant
// mutation is a separate concern: variants aren't itemized for edit here to
// avoid one endpoint silently deleting/recreating stock records; add/edit
// individual variants only once that need is concrete, per AGENTS.md §8).
export const updateProductSchema = createProductSchema.omit({ variants: true }).partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  parentId: z.string().uuid().optional(),
  imagePath: z.string().trim().min(1).optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  logoPath: z.string().trim().min(1).optional(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export const updateBrandSchema = createBrandSchema.partial();
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

// ── Image upload (docs/Architecture.md §5.4 signed-URL flow;
// docs/Security.md §9 file upload rules — no request/response shape is
// documented for these endpoints, research brief gaps #2/#3, designed here) ──

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Security.md §9 rule 3

export const requestImageUploadSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
});
export type RequestImageUploadInput = z.infer<typeof requestImageUploadSchema>;

export const confirmImageUploadSchema = z.object({
  storagePath: z.string().trim().min(1),
  altText: z.string().trim().max(300).optional(),
  variantId: z.string().uuid().optional(),
  isPrimary: z.boolean().default(false),
});
export type ConfirmImageUploadInput = z.infer<typeof confirmImageUploadSchema>;

export const reorderImagesSchema = z.object({
  images: z
    .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().nonnegative() }))
    .min(1),
});
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
