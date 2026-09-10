import { env } from '@/config/env';

export interface SmsProvider {
  sendOtp(params: { phone: string; code: string }): Promise<void>;
}

/**
 * Used whenever real MSG91 credentials aren't configured (local dev/test).
 * Deliberately never logs `params.code` — AGENTS.md §3 rule 8: "never add a
 * 'debug' path that echoes the code, even temporarily," applies to the stub
 * exactly as much as the real provider. Tests verify the OTP flow by
 * spying on this provider's `sendOtp` call args in-process (never via any
 * app-facing route or log line) — see tests/integration/otp/otp.test.ts.
 */
export class StubSmsProvider implements SmsProvider {
  async sendOtp(params: { phone: string }): Promise<void> {
    console.log(`[StubSmsProvider] would send an OTP SMS to ${params.phone}`);
  }
}

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

/** Never tested against a live MSG91 account, same caveat as the other real provider integrations built this project (Razorpay, Shipping). */
export class Msg91SmsProvider implements SmsProvider {
  async sendOtp(params: { phone: string; code: string }): Promise<void> {
    const url = new URL(MSG91_OTP_URL);
    url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID);
    url.searchParams.set('mobile', `91${params.phone}`);
    url.searchParams.set('authkey', env.MSG91_AUTH_KEY);
    url.searchParams.set('otp', params.code);
    url.searchParams.set('sender', env.MSG91_SENDER_ID);

    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      // Never include params.code in a thrown error — it would reach
      // server logs via job_queue.last_error otherwise (this send is
      // called synchronously from otp.service, not queued, but the same
      // rule applies).
      throw new Error(`MSG91 OTP send failed (${res.status}): ${bodyText.slice(0, 200)}`);
    }
  }
}

const PLACEHOLDER_SECRET = 'placeholder_not_configured';

function createSmsProvider(): SmsProvider {
  if (env.MSG91_AUTH_KEY === PLACEHOLDER_SECRET) {
    return new StubSmsProvider();
  }
  return new Msg91SmsProvider();
}

export const smsProvider: SmsProvider = createSmsProvider();
