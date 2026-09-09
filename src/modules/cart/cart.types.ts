/** Which anonymous/identified cart a request is acting on — never a raw userId/cartId from the client. */
export type CartIdentity = { userId: string } | { sessionId: string };

export interface CartItemView {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  quantity: number;
  priceSnapshot: number;
  currentPrice: number;
  /** False when the product/variant was archived or soft-deleted after being added. */
  available: boolean;
  priceChanged: boolean;
}

export interface CartView {
  id: string;
  items: CartItemView[];
  /** UX only — docs/API_Spec.md: "the client never computes the real total from this response." */
  subtotalEstimate: number;
}
