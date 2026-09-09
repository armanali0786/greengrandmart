export type ProductStatus = 'draft' | 'active' | 'archived';
export type ProductSort = 'price_asc' | 'price_desc' | 'newest' | 'popularity';

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  salePrice: number | null;
  primaryImage: string | null;
  inStock: boolean;
  isFeatured: boolean;
}

/** Admin's product list needs status (draft/active/archived) — customers never see it. */
export interface AdminProductListItem extends ProductListItem {
  status: ProductStatus;
}

export interface ProductVariantDetail {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number;
  salePrice: number | null;
  inStock: boolean;
  availableQty: number;
}

export interface ProductImageDetail {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  variantId: string | null;
  sortOrder: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  gstRate: number;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  images: ProductImageDetail[];
  variants: ProductVariantDetail[];
  reviewsSummary: { average: number; count: number };
  // Used for the PDP's <title>/<meta description>, falling back to
  // name/shortDescription when unset — not itemized in API_Spec.md's PDP
  // example response, but the fields exist on `products` specifically for
  // this and were otherwise never actually consumed anywhere.
  seoTitle: string | null;
  seoDescription: string | null;
}

/**
 * Everything the admin product editor needs that a customer never does:
 * product-level list price (real pricing comes from variants on the
 * customer-facing PDP), HSN code, featured flag, and draft/active/archived
 * status. A separate type from ProductDetail rather than folding these in —
 * `status` in particular is meaningless to expose publicly (the public query
 * only ever returns 'active' products anyway).
 */
export interface AdminProductDetail extends ProductDetail {
  basePrice: number;
  salePrice: number | null;
  hsnCode: string | null;
  isFeatured: boolean;
  status: ProductStatus;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imagePath: string | null;
  children: CategoryNode[];
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
