import { ForbiddenError } from '@/modules/auth/auth.errors';
import type { Role, SessionUser } from '@/modules/auth/auth.types';

/**
 * Role is always re-checked against the value already resolved from Postgres
 * on `SessionUser` (auth.service.ts re-reads it on every request) — never
 * trusted from the Firebase token's claims alone, per AGENTS.md §3.3.
 */
export function requireRole(user: SessionUser, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError();
  }
}

/**
 * Ownership is a separate check from role (docs/Security.md "RBAC enforcement
 * rules") — a role check alone doesn't prevent one customer from reaching
 * another customer's resource (IDOR). Callers pass the resource's owning
 * user id; this throws the same ForbiddenError either way so a caller can't
 * distinguish "not yours" from "doesn't exist" via the error itself.
 */
export function requireOwnership(user: SessionUser, resourceOwnerId: string): void {
  if (user.id !== resourceOwnerId) {
    throw new ForbiddenError();
  }
}
