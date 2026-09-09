import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import {
  adjustStock,
  convertReservationToSale,
  releaseReservation,
  reserveStock,
} from '@/modules/inventory/inventory.service';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';

function futureExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

async function getInventory(variantId: string) {
  return db.inventory.findUniqueOrThrow({ where: { variantId } });
}

describe('inventory service', () => {
  it('reserveStock moves quantity from available to reserved', async () => {
    const { productId, variantId } = await createTestVariant(10);
    try {
      const reservationId = await db.$transaction((tx) =>
        reserveStock(tx, { variantId, quantity: 3, expiresAt: futureExpiry() }),
      );
      expect(reservationId).toBeTruthy();

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(7);
      expect(inv.reservedQty).toBe(3);
    } finally {
      await deleteTestProduct(productId);
    }
  });

  it('reserveStock throws OutOfStockError when quantity exceeds available', async () => {
    const { productId, variantId } = await createTestVariant(2);
    try {
      await expect(
        db.$transaction((tx) =>
          reserveStock(tx, { variantId, quantity: 3, expiresAt: futureExpiry() }),
        ),
      ).rejects.toThrow(OutOfStockError);

      // A failed reservation must not have touched the counters.
      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(2);
      expect(inv.reservedQty).toBe(0);
    } finally {
      await deleteTestProduct(productId);
    }
  });

  it('releaseReservation restores available_qty and is idempotent', async () => {
    const { productId, variantId } = await createTestVariant(10);
    try {
      const reservationId = await db.$transaction((tx) =>
        reserveStock(tx, { variantId, quantity: 4, expiresAt: futureExpiry() }),
      );
      await db.$transaction((tx) => releaseReservation(tx, reservationId));

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(10);
      expect(inv.reservedQty).toBe(0);

      // Releasing an already-released reservation is a silent no-op, not a
      // double-refund of stock.
      await db.$transaction((tx) => releaseReservation(tx, reservationId));
      const invAfterSecondRelease = await getInventory(variantId);
      expect(invAfterSecondRelease.availableQty).toBe(10);
    } finally {
      await deleteTestProduct(productId);
    }
  });

  it('convertReservationToSale moves reserved to sold without touching available_qty, and is idempotent', async () => {
    const { productId, variantId } = await createTestVariant(10);
    try {
      const reservationId = await db.$transaction((tx) =>
        reserveStock(tx, { variantId, quantity: 4, expiresAt: futureExpiry() }),
      );
      await db.$transaction((tx) => convertReservationToSale(tx, reservationId));

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(6); // unchanged from the reserve step
      expect(inv.reservedQty).toBe(0);
      expect(inv.soldQty).toBe(4);

      const movement = await db.inventoryMovement.findFirst({
        where: { variantId, type: 'sale' },
      });
      expect(movement?.quantity).toBe(-4);

      await db.$transaction((tx) => convertReservationToSale(tx, reservationId));
      const invAfterSecondConvert = await getInventory(variantId);
      expect(invAfterSecondConvert.soldQty).toBe(4); // not double-counted
    } finally {
      await deleteTestProduct(productId);
    }
  });

  it('only one of two concurrent reservations for the last unit succeeds', async () => {
    const { productId, variantId } = await createTestVariant(1);
    try {
      const results = await Promise.allSettled([
        db.$transaction((tx) =>
          reserveStock(tx, { variantId, quantity: 1, expiresAt: futureExpiry() }),
        ),
        db.$transaction((tx) =>
          reserveStock(tx, { variantId, quantity: 1, expiresAt: futureExpiry() }),
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(0);
      expect(inv.reservedQty).toBe(1);
    } finally {
      await deleteTestProduct(productId);
    }
  });

  it('adjustStock: restock increases available_qty and logs a positive movement', async () => {
    const { productId, variantId } = await createTestVariant(5);
    const admin = await createTestUser({ role: 'admin' });
    try {
      const result = await adjustStock(admin, variantId, {
        type: 'restock',
        quantity: 20,
        note: 'New shipment',
      });
      expect(result.availableQty).toBe(25);

      const movement = await db.inventoryMovement.findFirst({
        where: { variantId, type: 'restock' },
      });
      expect(movement?.quantity).toBe(20);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(admin.id);
    }
  });

  it('adjustStock: damage decreases available_qty and increases damaged_qty', async () => {
    const { productId, variantId } = await createTestVariant(5);
    const admin = await createTestUser({ role: 'admin' });
    try {
      const result = await adjustStock(admin, variantId, {
        type: 'damage',
        quantity: 2,
        note: 'Water damage in warehouse',
      });
      expect(result.availableQty).toBe(3);

      const inv = await getInventory(variantId);
      expect(inv.damagedQty).toBe(2);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(admin.id);
    }
  });

  it('adjustStock: damage cannot exceed current available_qty', async () => {
    const { productId, variantId } = await createTestVariant(1);
    const admin = await createTestUser({ role: 'admin' });
    try {
      await expect(
        adjustStock(admin, variantId, { type: 'damage', quantity: 5, note: 'Too much' }),
      ).rejects.toThrow(OutOfStockError);

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(1); // untouched
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(admin.id);
    }
  });

  it('adjustStock: a non-admin/staff caller is rejected', async () => {
    const { productId, variantId } = await createTestVariant(5);
    const customer = await createTestUser({ role: 'customer' });
    try {
      await expect(
        adjustStock(customer, variantId, { type: 'restock', quantity: 1, note: 'x' }),
      ).rejects.toThrow();
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(customer.id);
    }
  });
});
