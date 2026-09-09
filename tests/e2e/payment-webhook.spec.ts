import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

/**
 * Verifies the piece of Phase 7 a browser alone can never reach: the
 * asynchronous Razorpay webhook that's the ONLY thing allowed to confirm an
 * order (docs/AGENTS.md §3 rule 5). No live Razorpay test account is
 * configured in this environment (see modules/payments/payment-provider.ts
 * — local dev uses StubPaymentProvider), and Razorpay's real servers can't
 * reach localhost anyway. So this test does exactly what a team without a
 * public webhook URL yet would do to test locally (and what
 * docs/Security.md §14's pre-launch checklist calls "Razorpay's test-mode
 * webhook tool"): synthesize a Razorpay-shaped payload and sign it with the
 * SAME secret our server verifies against (read from .env.local, same as
 * the server) — no shortcut in the app code itself, just driving the real
 * `/api/checkout/confirm` and `/api/payments/webhook` routes exactly as
 * Razorpay's client widget and servers would.
 */
test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const adminEmail = `webhook-admin+${runId}@example.com`;
const customerEmail = `webhook-customer+${runId}@example.com`;
const password = 'password123';

const categoryName = `Jewelry ${runId}`;
const categorySlug = `jewelry-${runId}`;
const productName = `Gold Hoop Earrings ${runId}`;
const productSlug = `gold-hoop-earrings-${runId}`;

function promoteToAdmin(userEmail: string) {
  execSync(`npm run set-user-role -- ${userEmail} admin`, { cwd: process.cwd(), stdio: 'pipe' });
}

function paymentSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
  return createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

function webhookSignature(rawBody: string): string {
  return createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
}

test('admin creates a product for the webhook flow', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Webhook Admin');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  promoteToAdmin(adminEmail);
  await page.reload();

  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Name').fill(categoryName);
  await page.getByLabel('Slug').fill(categorySlug);
  await page.getByRole('dialog').getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

  await page.goto('/admin/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByLabel('Name').blur();
  await page.locator('#categoryId').selectOption({ label: categoryName });
  await page.getByLabel('Base price (₹)').fill('2499');
  await page.getByLabel('GST rate (%)').fill('3');
  await page.getByLabel('SKU').fill(`GHE-${runId}`);
  await page.getByLabel('Price (₹)', { exact: true }).fill('2499');
  await page.getByLabel('Initial stock').fill('10');
  await page.locator('#status').selectOption('active');
  await page.getByRole('button', { name: 'Create product' }).click({ force: true });
  await page.waitForURL(/\/admin\/products\/.+\/edit/);
});

test('a genuinely-signed Razorpay webhook confirms the order; duplicates and forgeries are rejected', async ({
  page,
}) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Webhook Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).click();
  await page.getByLabel('Full name').fill('Webhook Customer');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Address line 1').fill('7 Marine Drive');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('400020');
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('7 Marine Drive')).toBeVisible();

  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByText('7 Marine Drive')).toBeVisible();

  const [checkoutResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/api/checkout') && res.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /^Pay ₹/ }).click(),
  ]);
  const { data: checkoutResult } = await checkoutResponse.json();
  expect(checkoutResult.razorpayOrderId).toBeTruthy();

  await page.waitForURL(new RegExp(`/account/orders/${checkoutResult.orderId}`));
  await expect(page.getByText('Payment Pending').first()).toBeVisible();

  // Capture a real bearer token off an authenticated request the order page
  // itself makes — same technique as tests/e2e/pricing.spec.ts.
  const [ordersGetResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith(`/api/orders/${checkoutResult.orderId}`) &&
        res.request().method() === 'GET',
    ),
    page.reload(),
  ]);
  const authHeader = ordersGetResponse.request().headers()['authorization'];

  // ── Step 1: client-confirm (necessary, not sufficient) ──────────────────
  const razorpayPaymentId = `pay_test_${runId}`;
  const confirmRes = await page.request.post('/api/checkout/confirm', {
    headers: { Authorization: authHeader },
    data: {
      orderId: checkoutResult.orderId,
      razorpayPaymentId,
      razorpaySignature: paymentSignature(checkoutResult.razorpayOrderId, razorpayPaymentId),
    },
  });
  expect(confirmRes.status()).toBe(200);
  const confirmBody = await confirmRes.json();
  expect(confirmBody.data.status).toBe('pending_confirmation');

  // Client-confirm alone must NOT move the order to Confirmed.
  await page.reload();
  await expect(page.getByText('Payment Pending').first()).toBeVisible();
  await expect(page.locator('ol li', { hasText: 'Confirmed' })).toHaveCount(0);

  // ── Step 2: the webhook — the only path to Confirmed ────────────────────
  const webhookPayload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: checkoutResult.razorpayOrderId,
          amount: checkoutResult.amount,
          status: 'captured',
        },
      },
    },
  });

  // A forged signature must be rejected outright, before any processing.
  const forgedRes = await page.request.post('/api/payments/webhook', {
    headers: { 'x-razorpay-signature': 'deadbeef', 'Content-Type': 'application/json' },
    data: webhookPayload,
  });
  expect(forgedRes.status()).toBe(400);
  await page.reload();
  await expect(page.getByText('Payment Pending').first()).toBeVisible();

  const webhookRes = await page.request.post('/api/payments/webhook', {
    headers: {
      'x-razorpay-signature': webhookSignature(webhookPayload),
      'Content-Type': 'application/json',
    },
    data: webhookPayload,
  });
  expect(webhookRes.status()).toBe(200);

  await page.reload();
  await expect(page.locator('ol li', { hasText: 'Confirmed' })).toHaveCount(1);

  // ── Step 3: duplicate delivery must not double-apply ────────────────────
  const dupRes = await page.request.post('/api/payments/webhook', {
    headers: {
      'x-razorpay-signature': webhookSignature(webhookPayload),
      'Content-Type': 'application/json',
    },
    data: webhookPayload,
  });
  expect(dupRes.status()).toBe(200);

  await page.reload();
  await expect(page.locator('ol li', { hasText: 'Confirmed' })).toHaveCount(1);

  // Order is now Confirmed and cancelable (docs/Product_Spec_Requirements.md
  // §5.2), and no "Retry payment" button — that's only for pending_payment.
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry payment' })).not.toBeVisible();
});
