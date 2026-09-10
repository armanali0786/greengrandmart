'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { clientEnv } from '@/config/env.client';

const firebaseConfig = {
  apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
}

let authEmulatorConnected = false;

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());

  if (clientEnv.NEXT_PUBLIC_FIREBASE_USE_EMULATOR && !authEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    authEmulatorConnected = true;
  }

  return auth;
}

export const googleAuthProvider = new GoogleAuthProvider();

/**
 * docs/Product_Spec_Requirements.md §10.2: web push, opt-in. Returns null
 * (never throws) whenever push isn't available/permitted — unsupported
 * browser, no VAPID key configured (local dev's Storage-emulator-adjacent
 * placeholder setup), or the user declines the permission prompt — so
 * callers can treat "no token" as a normal, silent outcome rather than an
 * error state.
 */
export async function requestPushToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !clientEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return null;
  if (!(await isSupported())) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  // The service worker runs in its own scope and can't import env.client.ts
  // (or read NEXT_PUBLIC_* directly) — its Firebase config travels as a
  // query string on the registration URL instead of being hardcoded into a
  // static public file, so the same file works across environments/projects.
  const swConfig = new URLSearchParams({
    apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${swConfig.toString()}`,
  );
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: clientEnv.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}
