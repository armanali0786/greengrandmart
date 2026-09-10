import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { test, expect } from '@playwright/test';

/**
 * End-to-end walk through Phase 9: welcome email/notification job enqueued
 * at signup, drained via the real /api/cron/process-jobs endpoint (the
 * same trigger Vercel Cron uses — no test-only backdoor), then verified in
 * the notification bell and the full notifications page, plus preference
 * toggling and push-enable button. OTP is API-only (no UI — COD checkout
 * is a documented future phase), so it's exercised via direct HTTP calls,
 * matching tests/e2e/payment-webhook.spec.ts's precedent for endpoints
 * with no frontend. The actual OTP code is never asserted on or logged
 * anywhere in this spec, in or out of process — AGENTS.md §3 rule 8.
 */
test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const customerEmail = `notif-customer+${runId}@example.com`;
const password = 'password123';

async function drainJobQueue(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/cron/process-jobs', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
}

/**
 * job_queue is claimed in bounded batches, shared with every other e2e spec
 * running concurrently in this suite (checkout, payments, shipping, etc.
 * all enqueue their own jobs into the same table) — so a single drain call
 * isn't guaranteed to reach this specific user's welcome job on its first
 * pass. Poll a few rounds, same idea as tests/integration/jobs/job.test.ts's
 * processUntilDone.
 */
async function waitForBellUnreadCount(
  page: import('@playwright/test').Page,
  count: string,
  maxRounds = 6,
) {
  const bellButton = page.getByRole('button', { name: /Notifications/ });
  for (let i = 0; i < maxRounds; i++) {
    await drainJobQueue(page.request);
    await page.reload();
    if (
      await bellButton
        .getByText(count)
        .isVisible()
        .catch(() => false)
    )
      return;
  }
  await expect(bellButton.getByText(count)).toBeVisible();
}

test('signup enqueues a welcome notification, visible in the bell and full list after draining', async ({
  page,
}) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Notif Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await waitForBellUnreadCount(page, '1');
  const bellButton = page.getByRole('button', { name: /Notifications/ });

  await bellButton.click();
  await expect(page.getByText('Welcome to GreenGrandMart', { exact: false })).toBeVisible();

  // Mark read from the dropdown — badge should disappear.
  await page.getByText('Welcome to GreenGrandMart', { exact: false }).click();
  await expect(bellButton.getByText('1')).not.toBeVisible();
});

test('notifications page lists activity and lets the customer manage preferences', async ({
  page,
}) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/account/notifications');
  await expect(page.getByText('Welcome to GreenGrandMart', { exact: false })).toBeVisible();

  const emailPromoToggle = page.getByLabel('Email — promotions');
  await expect(emailPromoToggle).toBeChecked();
  // A controlled checkbox — its `checked` state only flips once the
  // preferences mutation's round trip resolves, so click + a polling
  // expect (not .uncheck(), which verifies state immediately after the
  // click) is what actually waits for that.
  await emailPromoToggle.click();
  await expect(emailPromoToggle).not.toBeChecked();

  await page.reload();
  await expect(page.getByLabel('Email — promotions')).not.toBeChecked();

  // Push-enable button surfaces a status message even without real browser
  // notification permission granted in the test environment (headless
  // Chromium denies Notification permission by default) — it must not throw.
  await page.getByRole('button', { name: 'Enable push notifications on this device' }).click();
  await expect(page.locator('p.text-muted', { hasText: /push notification/i })).toBeVisible();
});

test('OTP request endpoint enforces the resend cooldown and never leaks the code', async ({
  request,
}) => {
  const phone = `9${String(runId).slice(-9)}`;

  const first = await request.post('/api/otp/request', {
    data: { phone, purpose: 'cod_confirmation' },
  });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data).toEqual({ sent: true, expiresInSeconds: expect.any(Number) });
  expect(JSON.stringify(firstBody)).not.toMatch(/"code"/);

  // Immediate resend is within the cooldown window — rejected.
  const second = await request.post('/api/otp/request', {
    data: { phone, purpose: 'cod_confirmation' },
  });
  expect(second.status()).toBe(429);
  const secondBody = await second.json();
  expect(secondBody.error.code).toBe('RATE_LIMITED');
});

test('OTP verify rejects an incorrect code without revealing the real one', async ({ request }) => {
  const phone = `8${String(runId).slice(-9)}`;

  await request.post('/api/otp/request', { data: { phone, purpose: 'cod_confirmation' } });

  const wrong = await request.post('/api/otp/verify', {
    data: { phone, code: '000000' },
  });
  expect(wrong.status()).toBe(400);
  const wrongBody = await wrong.json();
  expect(wrongBody.error.code).toBe('OTP_INVALID');
  expect(wrongBody.error.message).toMatch(/attempt/i);
});
