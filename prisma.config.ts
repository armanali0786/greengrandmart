import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

// Prisma 7 config: the CLI (migrate/introspect/studio) reads its connection
// details from here. The app runtime does NOT use this file — it builds its
// own PrismaClient with a driver adapter in src/lib/db.ts. Migrations use the
// direct (unpooled) connection, per docs/Environment_Config.md's DIRECT_DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_DATABASE_URL'),
  },
});
