import { env } from '@/config/env';
import { firebaseAdminMessaging } from '@/lib/firebase-admin';

export interface SendPushParams {
  fcmTokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  /** Returns the tokens FCM reported as invalid/unregistered, so the caller can prune them from `device_tokens`. */
  sendPush(params: SendPushParams): Promise<{ invalidTokens: string[] }>;
}

/** Local dev/emulator — FCM has no emulator, and real sends against emulator-issued fake tokens would fail loudly, so this just logs. */
export class StubPushProvider implements PushProvider {
  async sendPush(params: SendPushParams): Promise<{ invalidTokens: string[] }> {
    console.log(
      `[StubPushProvider] would push to ${params.fcmTokens.length} device(s): "${params.title}"`,
    );
    return { invalidTokens: [] };
  }
}

export class FcmPushProvider implements PushProvider {
  async sendPush(params: SendPushParams): Promise<{ invalidTokens: string[] }> {
    if (params.fcmTokens.length === 0) return { invalidTokens: [] };

    const response = await firebaseAdminMessaging.sendEachForMulticast({
      tokens: params.fcmTokens,
      notification: { title: params.title, body: params.body },
      data: params.data,
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((r, i) => {
      // docs have no rule on token pruning — reasonable inference: an
      // unregistered/invalid-argument token will never succeed again, so
      // it's safe (and tidy) to prune it from device_tokens on this signal.
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        invalidTokens.push(params.fcmTokens[i]);
      }
    });
    return { invalidTokens };
  }
}

function createPushProvider(): PushProvider {
  if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return new StubPushProvider();
  }
  return new FcmPushProvider();
}

export const pushProvider: PushProvider = createPushProvider();
