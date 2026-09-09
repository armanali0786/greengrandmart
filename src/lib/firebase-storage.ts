import { getStorage } from 'firebase-admin/storage';
import { env } from '@/config/env';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

/**
 * When NEXT_PUBLIC_FIREBASE_USE_EMULATOR is true, the Storage emulator must
 * be explicitly pointed at via this env var (the Admin SDK doesn't infer it
 * the way it does FIREBASE_AUTH_EMULATOR_HOST) — set before any
 * firebase-admin/storage call, mirroring lib/firebase-admin.ts's pattern.
 */
if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
  // Needs the scheme — the underlying @google-cloud/storage client defaults
  // to https and gets a TLS handshake error ("wrong version number")
  // against the emulator's plain-HTTP server without it.
  process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199';
}

// getFirebaseAdminApp() (not the bare getStorage()) guarantees the default
// app is initialized regardless of whether firebase-admin.ts happened to be
// imported first — getStorage() throws 'app/no-app' otherwise.
const bucket = getStorage(getFirebaseAdminApp()).bucket(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

export function getStorageBucket() {
  return bucket;
}

/**
 * Public URL for a file under a publicly-readable Storage path (products/**,
 * categories/**, brands/** per docs/Security.md's Storage rules table — never
 * use this for invoices/** or other private paths, those need signed URLs).
 */
export function getPublicImageUrl(storagePath: string): string {
  if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return `http://127.0.0.1:9199/v0/b/${env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
}
