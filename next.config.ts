import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Disambiguates the workspace root: a stray package-lock.json in the
  // parent home directory (unrelated to this project) would otherwise make
  // Turbopack guess wrong and warn on every build.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      // Local Firebase Storage emulator (dev only).
      { protocol: 'http', hostname: '127.0.0.1', port: '9199', pathname: '/v0/b/**' },
      // Production Firebase Storage.
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/**' },
    ],
    // Next's image optimizer refuses to fetch from private IPs by default
    // (real SSRF protection — don't remove this reasoning if touching this
    // file later). That blocks the local Storage emulator at 127.0.0.1,
    // which is our own machine, not attacker-controlled, so it's safe to
    // allow — but only when the emulator is actually in use. Production
    // never sets NEXT_PUBLIC_FIREBASE_USE_EMULATOR (Environment_Config.md's
    // "absolute rule"), so this exception can't reach a real deployment.
    dangerouslyAllowLocalIP: process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === 'true',
  },
};

export default nextConfig;
