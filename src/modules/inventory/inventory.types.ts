export type MovementType = 'restock' | 'sale' | 'return' | 'damage' | 'adjustment';

/** Row on the admin `/admin/inventory` list — one per variant. */
export interface InventoryListItem {
  variantId: string;
  sku: string;
  attributes: Record<string, string>;
  productId: string;
  productName: string;
  availableQty: number;
  reservedQty: number;
  soldQty: number;
  damagedQty: number;
  lowStockThreshold: number;
  lowStock: boolean;
}
