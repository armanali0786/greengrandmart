/**
 * Dev/ops tool to set a user's role directly in Postgres — there is no API
 * endpoint for this (role escalation must never be self-service; AGENTS.md
 * §3.3 "never trust a role from the client"). No documented mechanism exists
 * anywhere in docs/ for bootstrapping the first admin — this is the standard,
 * safe pattern for that: requires direct DB/server access to run, not
 * reachable over HTTP.
 *
 * Usage: npm run set-user-role -- someone@example.com admin
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const [, , email, role] = process.argv;
const VALID_ROLES = ['customer', 'staff', 'admin'];

if (!email || !role || !VALID_ROLES.includes(role)) {
  console.error(`Usage: npm run set-user-role -- <email> <${VALID_ROLES.join('|')}>`);
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}. They must sign up first.`);
    process.exit(1);
  }

  await db.user.update({ where: { email }, data: { role } });
  console.log(`${email} is now role="${role}".`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
