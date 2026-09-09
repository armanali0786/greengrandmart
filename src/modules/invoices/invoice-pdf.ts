import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { env } from '@/config/env';
import type { OrderDetailRow } from '@/modules/orders/order.repository';
import type { AddressSnapshot } from '@/modules/orders/order.types';

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

/**
 * pdf-lib's StandardFonts (WinAnsi encoding) can't encode the ₹ glyph —
 * embedding a Unicode font just for the rupee sign is overkill for this
 * document, so the PDF uses "Rs." instead of lib/money.ts's toRupeeDisplay()
 * (₹ is still used everywhere in the UI; this is PDF-rendering-only).
 * Negative values (discount rows) render with a leading minus, e.g. "-Rs. 50.00".
 */
function money(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  return `${sign}Rs. ${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function isIntraState(shippingState: string): boolean {
  return shippingState.trim().toLowerCase() === env.SELLER_STATE.trim().toLowerCase();
}

/**
 * Reproduces pricing.service.computeOrderTotal()'s exact per-line CGST/SGST
 * split (floor each line's tax in half, remainder to SGST) from the
 * immutable `order_items.tax_amount` snapshots — orders/order_items store
 * only the aggregate `tax_total`, not a pre-split cgst/sgst/igst, so this is
 * recomputed from already-charged, never-changing data rather than adding
 * new columns for it (see Data_Model_DB_Schema.md's invoices addendum).
 */
function splitTax(order: OrderDetailRow): { cgst: number; sgst: number; igst: number } {
  const address = order.shippingAddress as unknown as AddressSnapshot;
  const intraState = isIntraState(address.state);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const item of order.items) {
    if (intraState) {
      const half = Math.floor(item.taxAmount / 2);
      cgst += half;
      sgst += item.taxAmount - half;
    } else {
      igst += item.taxAmount;
    }
  }
  return { cgst, sgst, igst };
}

interface Cursor {
  page: PDFPage;
  y: number;
}

function newPage(doc: PDFDocument): Cursor {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: PAGE_HEIGHT - MARGIN };
}

function ensureSpace(doc: PDFDocument, cursor: Cursor, needed: number): Cursor {
  if (cursor.y - needed < MARGIN) return newPage(doc);
  return cursor;
}

function text(
  cursor: Cursor,
  value: string,
  x: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
): void {
  cursor.page.drawText(value, { x, y: cursor.y, size, font, color });
}

/** GST-compliant per PRD.md §7: GSTIN, HSN/SAC (product SKU stands in — no dedicated HSN field exists in the catalog schema), CGST/SGST/IGST breakdown. */
export async function generateInvoicePdf(order: OrderDetailRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const shippingAddress = order.shippingAddress as unknown as AddressSnapshot;
  const { cgst, sgst, igst } = splitTax(order);

  let cursor = newPage(doc);

  text(cursor, 'GreenGrandMart', MARGIN, bold, 18);
  text(cursor, 'TAX INVOICE', PAGE_WIDTH - MARGIN - 100, bold, 14);
  cursor.y -= 20;
  text(cursor, `GSTIN: ${env.SELLER_GSTIN}`, MARGIN, font, 10);
  cursor.y -= 14;
  text(cursor, `State: ${env.SELLER_STATE}`, MARGIN, font, 10);
  cursor.y -= 24;

  text(cursor, `Invoice / Order No: ${order.orderNumber}`, MARGIN, font, 10);
  text(
    cursor,
    `Date: ${order.placedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    PAGE_WIDTH - MARGIN - 150,
    font,
    10,
  );
  cursor.y -= 20;

  text(cursor, 'Bill To / Ship To:', MARGIN, bold, 10);
  cursor.y -= 14;
  const addressLines = [
    shippingAddress.name,
    `${shippingAddress.line1}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}`,
    `${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`,
    `Phone: ${shippingAddress.phone}`,
  ];
  for (const line of addressLines) {
    text(cursor, line, MARGIN, font, 10);
    cursor.y -= 13;
  }
  cursor.y -= 16;

  // Item table header
  const columns = {
    name: MARGIN,
    sku: 250,
    qty: 340,
    unit: 380,
    discount: 440,
    tax: 490,
    total: 540,
  };
  cursor = ensureSpace(doc, cursor, 30);
  text(cursor, 'Item', columns.name, bold, 9);
  text(cursor, 'SKU', columns.sku, bold, 9);
  text(cursor, 'Qty', columns.qty, bold, 9);
  text(cursor, 'Unit', columns.unit, bold, 9);
  text(cursor, 'Disc.', columns.discount, bold, 9);
  text(cursor, 'Tax', columns.tax, bold, 9);
  text(cursor, 'Total', columns.total, bold, 9);
  cursor.y -= 10;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursor.y -= 14;

  for (const item of order.items) {
    cursor = ensureSpace(doc, cursor, 20);
    const name =
      item.productNameSnapshot.length > 30
        ? `${item.productNameSnapshot.slice(0, 27)}...`
        : item.productNameSnapshot;
    text(cursor, name, columns.name, font, 9);
    text(cursor, item.skuSnapshot, columns.sku, font, 9);
    text(cursor, String(item.quantity), columns.qty, font, 9);
    text(cursor, money(item.unitPrice), columns.unit, font, 9);
    text(cursor, money(item.discount), columns.discount, font, 9);
    text(cursor, money(item.taxAmount), columns.tax, font, 9);
    text(cursor, money(item.lineTotal), columns.total, font, 9);
    cursor.y -= 16;
  }

  cursor.y -= 10;
  cursor = ensureSpace(doc, cursor, 140);
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursor.y -= 20;

  const summaryLabelX = PAGE_WIDTH - MARGIN - 200;
  const summaryValueX = PAGE_WIDTH - MARGIN - 70;
  const summaryRow = (label: string, value: number, boldRow = false): void => {
    const f = boldRow ? bold : font;
    text(cursor, label, summaryLabelX, f, 10);
    text(cursor, money(value), summaryValueX, f, 10);
    cursor.y -= 16;
  };
  summaryRow('Subtotal', order.subtotal);
  if (order.discountTotal > 0) summaryRow('Promotion discount', -order.discountTotal);
  if (order.couponDiscount > 0) summaryRow('Coupon discount', -order.couponDiscount);
  summaryRow('Shipping', order.shippingFee);
  if (cgst > 0) summaryRow('CGST', cgst);
  if (sgst > 0) summaryRow('SGST', sgst);
  if (igst > 0) summaryRow('IGST', igst);
  cursor.y -= 4;
  cursor.page.drawLine({
    start: { x: summaryLabelX, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursor.y -= 16;
  summaryRow('Grand Total', order.grandTotal, true);

  cursor.y -= 30;
  cursor = ensureSpace(doc, cursor, 20);
  text(
    cursor,
    'This is a system-generated invoice and does not require a signature.',
    MARGIN,
    font,
    8,
    rgb(0.4, 0.4, 0.4),
  );

  return doc.save();
}
