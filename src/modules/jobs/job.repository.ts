import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { JobStatus, JobType } from '@/modules/jobs/job.types';

export interface JobRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  maxAttempts: number;
}

export async function createJobRow(params: {
  type: JobType;
  payload: object;
  runAfter?: Date;
}): Promise<void> {
  await db.jobQueue.create({
    data: {
      type: params.type,
      payload: params.payload as Prisma.InputJsonValue,
      runAfter: params.runAfter,
    },
  });
}

/**
 * docs/Architecture.md §5.3: `SELECT pending jobs FROM job_queue (FOR UPDATE
 * SKIP LOCKED)` — Prisma can't express `SKIP LOCKED`, so this drops to raw
 * SQL for the read, same pattern as inventory/order row-locking elsewhere.
 * `SKIP LOCKED` (not just `FOR UPDATE`) matters here specifically because,
 * unlike a single-order lock, this claims a *batch*: without it, two
 * concurrent cron invocations would serialize on each other's locked rows
 * instead of each claiming a disjoint set to work on.
 */
export async function claimPendingJobs(
  tx: Prisma.TransactionClient,
  limit: number,
): Promise<JobRow[]> {
  const rows = await tx.$queryRaw<JobRow[]>`
    SELECT id, type, payload, status, attempts, max_attempts AS "maxAttempts"
    FROM job_queue
    WHERE status = 'pending' AND run_after <= now()
    ORDER BY run_after ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `;
  if (rows.length > 0) {
    await tx.jobQueue.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'processing' },
    });
  }
  return rows;
}

function isRecordNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

/**
 * A claimed job row disappearing before this update runs (e.g. Vercel
 * Cron's at-least-once delivery overlapping two invocations, or — in
 * tests — another concurrently-running test file's own cleanup) is a
 * harmless race, not a bug to surface: whatever claimed/removed the row
 * already owns its outcome. Swallowed the same way other idempotent
 * operations in this codebase treat a vanished row.
 */
export async function markJobDone(id: string): Promise<void> {
  try {
    await db.jobQueue.update({ where: { id }, data: { status: 'done', processedAt: new Date() } });
  } catch (e) {
    if (!isRecordNotFound(e)) throw e;
  }
}

const BASE_BACKOFF_SECONDS = 30;

/** Exponential backoff (attempts²×30s) until max_attempts is reached, then terminally 'failed' — docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §6: "retry with backoff up to max_attempts... on final failure: mark 'failed', log to audit." */
export async function markJobFailedOrRetry(
  job: { id: string; attempts: number; maxAttempts: number },
  error: string,
): Promise<JobStatus> {
  const attempts = job.attempts + 1;
  if (attempts >= job.maxAttempts) {
    try {
      await db.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          attempts,
          lastError: error.slice(0, 2000),
          processedAt: new Date(),
        },
      });
    } catch (e) {
      if (!isRecordNotFound(e)) throw e;
    }
    return 'failed';
  }
  const delaySeconds = BASE_BACKOFF_SECONDS * attempts * attempts;
  try {
    await db.jobQueue.update({
      where: { id: job.id },
      data: {
        status: 'pending',
        attempts,
        lastError: error.slice(0, 2000),
        runAfter: new Date(Date.now() + delaySeconds * 1000),
      },
    });
  } catch (e) {
    if (!isRecordNotFound(e)) throw e;
  }
  return 'pending';
}

export interface FailedJobRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

export async function findFailedJobs(params: {
  page: number;
  limit: number;
}): Promise<{ rows: FailedJobRow[]; total: number }> {
  const where: Prisma.JobQueueWhereInput = { status: 'failed' };
  const [rows, total] = await Promise.all([
    db.jobQueue.findMany({
      where,
      orderBy: { processedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: {
        id: true,
        type: true,
        payload: true,
        attempts: true,
        lastError: true,
        processedAt: true,
        createdAt: true,
      },
    }),
    db.jobQueue.count({ where }),
  ]);
  return { rows, total };
}
