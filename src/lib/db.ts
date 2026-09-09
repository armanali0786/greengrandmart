import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '@/config/env';

// Prisma 7 requires a driver adapter for the runtime client (prisma.config.ts
// is CLI-only, for migrate/introspect). Uses the pooled DATABASE_URL — direct
// connections are reserved for migrations, see prisma.config.ts.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

declare global {
  var __prisma: PrismaClient | undefined;
}

// Reuse a single client across Next.js dev hot-reloads to avoid exhausting
// Postgres connections.
export const db = globalThis.__prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = db;
}

export type { Prisma, PrismaClient } from '@prisma/client';
