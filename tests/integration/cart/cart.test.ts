import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import {
  addItem,
  getCart,
  mergeGuestCart,
  removeItem,
  updateItemQuantity,
} from '@/modules/cart/cart.service';
import { NotFoundError } from '@/lib/errors';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';
import type { CartIdentity } from '@/modules/cart/cart.types';

function guestIdentity(): { sessionId: string } {
  return { sessionId: randomUUID() };
}

async function deleteCartsFor(identity: CartIdentity): Promise<void> {
  if ('userId' in identity) {
    await db.cart.deleteMany({ where: { userId: identity.userId } });
  } else {
    await db.cart.deleteMany({ where: { sessionId: identity.sessionId } });
  }
}

describe('cart service', () => {
  it('addItem creates a guest cart and snapshots the current effective price', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const identity = guestIdentity();
    try {
      const result = await addItem(identity, { variantId, quantity: 2 });
      expect(result.quantity).toBe(2);

      const cart = await getCart(identity);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].priceSnapshot).toBe(10000);
      expect(cart.items[0].currentPrice).toBe(10000);
      expect(cart.items[0].priceChanged).toBe(false);
      expect(cart.items[0].available).toBe(true);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('adding the same variant twice increments quantity rather than duplicating the line', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const identity = guestIdentity();
    try {
      await addItem(identity, { variantId, quantity: 2 });
      await addItem(identity, { variantId, quantity: 3 });

      const cart = await getCart(identity);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('addItem rejects a quantity beyond available stock', async () => {
    const { productId, variantId } = await createTestVariant(2);
    const identity = guestIdentity();
    try {
      await expect(addItem(identity, { variantId, quantity: 5 })).rejects.toThrow(OutOfStockError);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('getCart flags a price change since the item was added', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const identity = guestIdentity();
    try {
      await addItem(identity, { variantId, quantity: 1 });
      await db.productVariant.update({ where: { id: variantId }, data: { price: 15000 } });

      const cart = await getCart(identity);
      expect(cart.items[0].priceSnapshot).toBe(10000);
      expect(cart.items[0].currentPrice).toBe(15000);
      expect(cart.items[0].priceChanged).toBe(true);
      // subtotalEstimate uses the live price, never the stale snapshot.
      expect(cart.subtotalEstimate).toBe(15000);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('getCart flags an archived product as unavailable', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const identity = guestIdentity();
    try {
      await addItem(identity, { variantId, quantity: 1 });
      await db.product.update({ where: { id: productId }, data: { status: 'archived' } });

      const cart = await getCart(identity);
      expect(cart.items[0].available).toBe(false);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('updateItemQuantity rejects a caller who is not the cart owner (guest session mismatch)', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const owner = guestIdentity();
    const attacker = guestIdentity();
    try {
      const { itemId } = await addItem(owner, { variantId, quantity: 1 });
      await expect(updateItemQuantity(attacker, itemId, { quantity: 2 })).rejects.toThrow(
        NotFoundError,
      );
      await expect(removeItem(attacker, itemId)).rejects.toThrow(NotFoundError);
    } finally {
      await deleteCartsFor(owner);
      await deleteCartsFor(attacker);
      await deleteTestProduct(productId);
    }
  });

  it('updateItemQuantity rejects a quantity beyond available stock', async () => {
    const { productId, variantId } = await createTestVariant(3);
    const identity = guestIdentity();
    try {
      const { itemId } = await addItem(identity, { variantId, quantity: 1 });
      await expect(updateItemQuantity(identity, itemId, { quantity: 10 })).rejects.toThrow(
        OutOfStockError,
      );
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('removeItem deletes the line', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const identity = guestIdentity();
    try {
      const { itemId } = await addItem(identity, { variantId, quantity: 1 });
      await removeItem(identity, itemId);

      const cart = await getCart(identity);
      expect(cart.items).toHaveLength(0);
    } finally {
      await deleteCartsFor(identity);
      await deleteTestProduct(productId);
    }
  });

  it('mergeGuestCart moves items into the user cart, summing quantities on collision', async () => {
    const { productId, variantId } = await createTestVariant(10);
    const guest = guestIdentity();
    const user = await createTestUser();
    try {
      await addItem(guest, { variantId, quantity: 2 });
      await addItem({ userId: user.id }, { variantId, quantity: 1 });

      await mergeGuestCart(user.id, guest.sessionId);

      const userCart = await getCart({ userId: user.id });
      expect(userCart.items).toHaveLength(1);
      expect(userCart.items[0].quantity).toBe(3);

      // The guest cart itself is gone, not just emptied.
      const guestCartRow = await db.cart.findFirst({ where: { sessionId: guest.sessionId } });
      expect(guestCartRow).toBeNull();
    } finally {
      await deleteCartsFor(guest);
      await deleteCartsFor({ userId: user.id });
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
