import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OtpPurpose } from '@/modules/otp/otp.types';

export interface OtpRequestRow {
  id: string;
  phone: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  createdAt: Date;
}

export async function createOtpRequestRow(params: {
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  ipAddress: string | null;
}): Promise<OtpRequestRow> {
  return db.otpRequest.create({
    data: {
      phone: params.phone,
      purpose: params.purpose,
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
      ipAddress: params.ipAddress,
    },
  });
}

/** docs/Security.md §8: "/otp/request → 3/10min keyed by phone." */
export async function countRecentRequests(
  phone: string,
  purpose: OtpPurpose,
  sinceMinutesAgo: number,
): Promise<number> {
  return db.otpRequest.count({
    where: {
      phone,
      purpose,
      createdAt: { gt: new Date(Date.now() - sinceMinutesAgo * 60 * 1000) },
    },
  });
}

/** Most recent request for this phone/purpose — backs both the 60s resend cooldown and (unverified/unexpired) the target of a verify call. */
export async function findLatestForPhone(
  phone: string,
  purpose: OtpPurpose,
): Promise<OtpRequestRow | null> {
  return db.otpRequest.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: 'desc' },
  });
}

/** Locks the row for the verify call's attempt-increment — two concurrent verify attempts for the same code must not both slip past the max_attempts check. */
export async function lockOtpRequestForUpdate(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<OtpRequestRow | null> {
  const rows = await tx.$queryRaw<OtpRequestRow[]>`
    SELECT id, phone, purpose, code_hash AS "codeHash", expires_at AS "expiresAt",
           attempts, max_attempts AS "maxAttempts", verified, created_at AS "createdAt"
    FROM otp_requests WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function incrementAttempts(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.otpRequest.update({ where: { id }, data: { attempts: { increment: 1 } } });
}

export async function markVerified(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.otpRequest.update({ where: { id }, data: { verified: true } });
}

export async function findById(id: string): Promise<OtpRequestRow | null> {
  return db.otpRequest.findUnique({ where: { id } });
}

/** ECOMMERCE_IMPLEMENTATION_PLAN.md §5.2: "otp_requests rows older than 24h are purged by a daily cron job." */
export async function deleteExpiredBefore(cutoff: Date): Promise<number> {
  const result = await db.otpRequest.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
