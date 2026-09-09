import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// Shared by both the full-cart query and the single-item-by-id lookup so
// the two never drift out of sync on what a "cart item view" needs joined.
const variantWithImagesInclude = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      deletedAt: true,
      // Fallback when the variant has no image of its own — `images` on
      // ProductVariant only ever returns rows whose variant_id matches
      // that variant, never a product-level (variant_id null) image.
      images: {
        where: { variantId: null },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
      },
    },
  },
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
  },
} satisfies Prisma.ProductVariantInclude;

const cartWithItemsInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { variant: { include: variantWithImagesInclude } },
  },
} satisfies Prisma.CartInclude;

export type CartRow = Prisma.CartGetPayload<{ include: typeof cartWithItemsInclude }>;
export type CartItemRow = CartRow['items'][number];

export async function findActiveCartByUser(userId: string): Promise<CartRow | null> {
  return db.cart.findFirst({ where: { userId, status: 'active' }, include: cartWithItemsInclude });
}

export async function findActiveCartBySession(sessionId: string): Promise<CartRow | null> {
  return db.cart.findFirst({
    where: { sessionId, status: 'active' },
    include: cartWithItemsInclude,
  });
}

/**
 * Optimistic create, not find-then-create: two requests for the same
 * brand-new owner can race (e.g. the Header's own cart fetch landing at the
 * same moment as the post-login cart-merge call), and a plain
 * find-then-create would let both pass the "no active cart yet" check
 * before either commits — silently splitting the owner into two carts. The
 * unique partial indexes idx_carts_user/idx_carts_session (one active cart
 * per owner, see the unique_active_cart_per_owner migration) turn the
 * loser's create into a P2002, which this falls back to a lookup on,
 * mirroring auth.repository.ts's findOrCreateUserForFirebaseUid.
 */
export async function createCart(data: { userId?: string; sessionId?: string }): Promise<CartRow> {
  try {
    return await db.cart.create({
      data: { userId: data.userId, sessionId: data.sessionId },
      include: cartWithItemsInclude,
    });
  } catch (e) {
    const isUniqueConstraintError =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    if (!isUniqueConstraintError) throw e;

    const existing = data.userId
      ? await findActiveCartByUser(data.userId)
      : await findActiveCartBySession(data.sessionId!);
    if (!existing) throw e; // shouldn't happen — the constraint conflict implies a matching row exists
    return existing;
  }
}

const cartItemWithOwnerInclude = {
  cart: { select: { id: true, userId: true, sessionId: true } },
  variant: { include: variantWithImagesInclude },
} satisfies Prisma.CartItemInclude;

export type CartItemWithOwnerRow = Prisma.CartItemGetPayload<{
  include: typeof cartItemWithOwnerInclude;
}>;

export async function findCartItemWithOwner(id: string): Promise<CartItemWithOwnerRow | null> {
  return db.cartItem.findUnique({ where: { id }, include: cartItemWithOwnerInclude });
}

export interface VariantForCartAdd {
  id: string;
  price: number;
  salePrice: number | null;
  product: { id: string; status: string; deletedAt: Date | null };
}

export async function findVariantForCartAdd(variantId: string): Promise<VariantForCartAdd | null> {
  return db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      price: true,
      salePrice: true,
      product: { select: { id: true, status: true, deletedAt: true } },
    },
  });
}

/**
 * Adding an already-in-cart variant increments its quantity rather than
 * duplicating a row — `cart_items` has a UNIQUE(cart_id, variant_id)
 * constraint precisely to make this an upsert. priceSnapshot is always
 * refreshed to the current price on every add, even for an existing line,
 * so it doesn't go stale while more of the same item keeps getting added.
 */
export async function upsertCartItem(params: {
  cartId: string;
  variantId: string;
  quantity: number;
  priceSnapshot: number;
}): Promise<{ id: string; quantity: number }> {
  return db.cartItem.upsert({
    where: { cartId_variantId: { cartId: params.cartId, variantId: params.variantId } },
    update: { quantity: { increment: params.quantity }, priceSnapshot: params.priceSnapshot },
    create: {
      cartId: params.cartId,
      variantId: params.variantId,
      quantity: params.quantity,
      priceSnapshot: params.priceSnapshot,
    },
    select: { id: true, quantity: true },
  });
}

export async function updateCartItemQuantity(id: string, quantity: number): Promise<void> {
  await db.cartItem.update({ where: { id }, data: { quantity } });
}

export async function deleteCartItemRow(id: string): Promise<void> {
  await db.cartItem.delete({ where: { id } });
}

/**
 * Merges every item from the guest cart into the user's cart (creating the
 * user cart first if they don't have one yet), summing quantities on
 * collision via the same upsert-by-unique-constraint pattern as
 * upsertCartItem, then deletes the now-empty guest cart. Runs in a
 * transaction so a crash mid-merge can't duplicate or drop items.
 */
export async function mergeCartRows(guestCart: CartRow, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    let userCart = await tx.cart.findFirst({ where: { userId, status: 'active' } });
    if (!userCart) {
      userCart = await tx.cart.create({ data: { userId } });
    }

    for (const item of guestCart.items) {
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        update: { quantity: { increment: item.quantity } },
        create: {
          cartId: userCart.id,
          variantId: item.variantId,
          quantity: item.quantity,
          priceSnapshot: item.priceSnapshot,
        },
      });
    }

    await tx.cart.delete({ where: { id: guestCart.id } });
  });
}
