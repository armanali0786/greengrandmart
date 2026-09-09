/**
 * Client-safe payment constants — no server-only imports (same rule as
 * lib/order-status-display.ts), since these are read from 'use client'
 * checkout code as well as the server-side StubPaymentProvider.
 */

/** The fake key id StubPaymentProvider.createPayment() always returns — lets the checkout page tell "no real Razorpay account configured" apart from a real transaction without importing server env. */
export const RAZORPAY_STUB_KEY_ID = 'rzp_stub_not_a_real_key';
