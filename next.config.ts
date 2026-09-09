import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Disambiguates the workspace root: a stray package-lock.json in the
  // parent home directory (unrelated to this project) would otherwise make
  // Turbopack guess wrong and warn on every build.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
