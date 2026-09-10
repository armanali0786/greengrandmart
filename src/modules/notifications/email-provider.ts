import { env } from '@/config/env';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<void>;
}

/** Used whenever real Resend credentials aren't configured (local dev/test) — logs instead of sending, same shape as the payment/shipping stub fallbacks. */
export class StubEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<void> {
    console.log(`[StubEmailProvider] would send to ${params.to}: "${params.subject}"`);
  }
}

const RESEND_URL = 'https://api.resend.com/emails';

export class ResendEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<void> {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Resend send failed (${res.status}): ${bodyText.slice(0, 200)}`);
    }
  }
}

const PLACEHOLDER_SECRET = 'placeholder_not_configured';

function createEmailProvider(): EmailProvider {
  if (env.RESEND_API_KEY === PLACEHOLDER_SECRET) {
    return new StubEmailProvider();
  }
  return new ResendEmailProvider();
}

export const emailProvider: EmailProvider = createEmailProvider();
