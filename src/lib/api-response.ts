import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/lib/errors';

/**
 * Standard success/error envelope from docs/API_Spec.md. Every route handler
 * returns success(data) or error(e) — never a raw NextResponse.json().
 */
export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function error(e: unknown) {
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message ?? 'Invalid input.',
          field: issue?.path.join('.'),
        },
      },
      { status: 400 },
    );
  }

  if (e instanceof DomainError) {
    return NextResponse.json(
      { success: false, error: { code: e.code, message: e.message } },
      { status: e.httpStatus },
    );
  }

  // Unknown/unexpected error: never leak internals (stack trace, message) to
  // the client — full detail goes to server-side logs/Sentry only.
  console.error(e);
  return NextResponse.json(
    {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    },
    { status: 500 },
  );
}
