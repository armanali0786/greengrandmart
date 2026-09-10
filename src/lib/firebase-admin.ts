import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '@/config/env';

// When pointed at the emulator, the Admin SDK talks to it over
// FIREBASE_AUTH_EMULATOR_HOST and ignores credentials entirely — the
// `credential` below is never actually used in that mode.
if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}

// Exported so other lib modules (e.g. firebase-storage.ts) can get the same
// initialized app without relying on import order/side-effects to have
// already run initializeApp() — getStorage()/getAuth() both throw
// 'app/no-app' if called before some code initializes the default app.
export function getFirebaseAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  // The emulator ignores credentials entirely and ships no real service
  // account — building a `cert()` from the .env.local placeholder key would
  // fail to parse (it isn't a real PEM).
  if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return initializeApp({ projectId: env.FIREBASE_ADMIN_PROJECT_ID });
  }

  return initializeApp({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // .env files store literal "\n" — real newlines are required by the SDK.
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export const firebaseAdminAuth = getAuth(getFirebaseAdminApp());
// Reuses the same already-configured service account as Auth — no new env
// var needed for FCM (Phase 9's PushProvider).
export const firebaseAdminMessaging = getMessaging(getFirebaseAdminApp());
