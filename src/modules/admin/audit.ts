import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

interface WithAuditParams<T> {
  actorUserId: string;
  /** e.g. 'PRODUCT_CREATED', 'PRODUCT_PRICE_CHANGED' — AGENTS.md §7. */
  action: string;
  entityType: string;
  /** A function when the id is only known after the mutation runs (e.g. a create). */
  entityId: string | ((result: T) => string);
  before?: unknown;
  /** Defaults to the mutation's own return value. */
  after?: (result: T) => unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  mutate: () => Promise<T>;
}

/**
 * Wraps a sensitive admin write with an audit_logs row, per AGENTS.md §7:
 * "Any admin write to products (price/stock-affecting fields), inventory,
 * orders.status, refunds, or users.role must be wrapped in the shared
 * withAudit() helper." Runs the mutation first, then logs — a logging
 * failure never blocks the mutation the admin actually asked for; it
 * surfaces via the normal error path (thrown, caught by the route handler)
 * for visibility instead of being silently swallowed.
 */
export async function withAudit<T>(params: WithAuditParams<T>): Promise<T> {
  const result = await params.mutate();
  const entityId =
    typeof params.entityId === 'function' ? params.entityId(result) : params.entityId;

  await db.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId,
      before: (params.before ?? null) as Prisma.InputJsonValue,
      after: (params.after ? params.after(result) : result) as Prisma.InputJsonValue,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  return result;
}

// Re-exported so admin routes can `import { requireRole } from '@/modules/admin/audit'`
// or a future `modules/admin/index.ts`, matching AGENTS.md §7's "requireRole()
// from modules/admin" — the actual implementation lives in modules/auth/auth.guard.ts
// per Coding_Standards.md's more detailed folder listing; see that file's comment.
export { requireRole, requireOwnership } from '@/modules/auth/auth.guard';
