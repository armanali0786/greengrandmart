import { NotFoundError } from '@/lib/errors';
import { getPublicImageUrl } from '@/lib/firebase-storage';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';
import { getAvailableStock } from '@/modules/inventory/inventory.service';
import * as repo from '@/modules/cart/cart.repository';
import type { CartRow, CartItemRow, CartItemWithOwnerRow } from '@/modules/cart/cart.repository';
import type { AddCartItemInput, UpdateCartItemInput } from '@/modules/cart/cart.schema';
import type { CartIdentity, CartItemView, CartView } from '@/modules/cart/cart.types';

async function getOrCreateCart(identity: CartIdentity): Promise<CartRow> {
  const existing =
    'userId' in identity
      ? await repo.findActiveCartByUser(identity.userId)
      : await repo.findActiveCartBySession(identity.sessionId);
  if (existing) return existing;

  return 'userId' in identity
    ? repo.createCart({ userId: identity.userId })
    : repo.createCart({ sessionId: identity.sessionId });
}

function effectivePrice(variant: { price: number; salePrice: number | null }): number {
  return variant.salePrice ?? variant.price;
}

function imageUrlFor(variant: CartItemRow['variant']): string | null {
  const storagePath = variant.images[0]?.storagePath ?? variant.product.images[0]?.storagePath;
  return storagePath ? getPublicImageUrl(storagePath) : null;
}

function toItemView(item: CartItemRow, availableQty: number): CartItemView {
  const product = item.variant.product;
  const currentPrice = effectivePrice(item.variant);
  const productLive = product.status === 'active' && product.deletedAt === null;
  return {
    id: item.id,
    variantId: item.variantId,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    attributes: item.variant.attributes as Record<string, string>,
    imageUrl: imageUrlFor(item.variant),
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    currentPrice,
    // "Fulfillable as-is": live, not deleted/archived, and enough stock for
    // the quantity actually sitting in the cart right now — not just "in
    // stock at all." Not itemized further than a single boolean in
    // docs/API_Spec.md's example response; this is the more actionable
    // reading (drives the same "please update your cart" UX either way).
    available: productLive && availableQty >= item.quantity,
    priceChanged: currentPrice !== item.priceSnapshot,
  };
}

async function toCartView(cart: CartRow): Promise<CartView> {
  const variantIds = cart.items.map((i) => i.variantId);
  const stock = await getAvailableStock(variantIds);
  const items = cart.items.map((item) => toItemView(item, stock.get(item.variantId) ?? 0));
  const subtotalEstimate = items.reduce((sum, i) => sum + i.currentPrice * i.quantity, 0);
  return { id: cart.id, items, subtotalEstimate };
}

/** GET /cart — docs/API_Spec.md §4: live-validated, `subtotalEstimate` is UX-only. */
export async function getCart(identity: CartIdentity): Promise<CartView> {
  const cart = await getOrCreateCart(identity);
  return toCartView(cart);
}

export async function addItem(
  identity: CartIdentity,
  input: AddCartItemInput,
): Promise<{ cartId: string; itemId: string; quantity: number }> {
  const variant = await repo.findVariantForCartAdd(input.variantId);
  if (!variant || variant.product.status !== 'active' || variant.product.deletedAt) {
    throw new NotFoundError('Product not found.');
  }

  const cart = await getOrCreateCart(identity);
  const existingQty = cart.items.find((i) => i.variantId === input.variantId)?.quantity ?? 0;

  const stock = await getAvailableStock([input.variantId]);
  const availableQty = stock.get(input.variantId) ?? 0;
  const wanted = existingQty + input.quantity;
  if (availableQty < wanted) {
    const remaining = Math.max(availableQty - existingQty, 0);
    throw new OutOfStockError(
      remaining > 0 ? `Only ${remaining} more available.` : 'This item is out of stock.',
    );
  }

  const result = await repo.upsertCartItem({
    cartId: cart.id,
    variantId: input.variantId,
    quantity: input.quantity,
    priceSnapshot: effectivePrice(variant),
  });
  return { cartId: cart.id, itemId: result.id, quantity: result.quantity };
}

/**
 * Same "doesn't exist or isn't yours" NotFoundError used elsewhere in this
 * codebase for ownership checks (e.g. addresses) — doesn't distinguish the
 * two cases in the response, avoiding an IDOR-adjacent existence leak.
 */
function assertOwnsCartItem(item: CartItemWithOwnerRow, identity: CartIdentity): void {
  const owns =
    'userId' in identity
      ? item.cart.userId === identity.userId
      : item.cart.sessionId === identity.sessionId;
  if (!owns) throw new NotFoundError('Cart item not found.');
}

export async function updateItemQuantity(
  identity: CartIdentity,
  itemId: string,
  input: UpdateCartItemInput,
): Promise<void> {
  const item = await repo.findCartItemWithOwner(itemId);
  if (!item) throw new NotFoundError('Cart item not found.');
  assertOwnsCartItem(item, identity);

  const stock = await getAvailableStock([item.variantId]);
  const availableQty = stock.get(item.variantId) ?? 0;
  if (availableQty < input.quantity) {
    throw new OutOfStockError(
      availableQty > 0 ? `Only ${availableQty} available.` : 'This item is out of stock.',
    );
  }

  await repo.updateCartItemQuantity(itemId, input.quantity);
}

export async function removeItem(identity: CartIdentity, itemId: string): Promise<void> {
  const item = await repo.findCartItemWithOwner(itemId);
  if (!item) throw new NotFoundError('Cart item not found.');
  assertOwnsCartItem(item, identity);

  await repo.deleteCartItemRow(itemId);
}

/** POST /cart/merge — called right after login bridges a Firebase identity into our session. */
export async function mergeGuestCart(userId: string, sessionId: string): Promise<void> {
  const guestCart = await repo.findActiveCartBySession(sessionId);
  if (!guestCart || guestCart.items.length === 0) return;
  await repo.mergeCartRows(guestCart, userId);
}
