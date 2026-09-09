'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CouponPreview } from '@/modules/pricing/pricing.types';

export type AppliedCoupon = CouponPreview & { code: string };

export interface CouponInputProps {
  applied: AppliedCoupon | null;
  onApply: (result: AppliedCoupon | null) => void;
}

/**
 * docs/UX_UI_Spec.md §4.4: cart's "coupon code input" element. Calls
 * POST /coupons/validate (preview-only, Bearer-required per API_Spec.md §7
 * — real redemption only ever happens inside checkout's own transaction,
 * Phase 6) — so this is purely an estimate shown here, never a commitment.
 */
export function CouponInput({ applied, onApply }: CouponInputProps) {
  const { firebaseUser, loading } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleApply() {
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const preview = await authFetch<CouponPreview>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      onApply({ ...preview, code: code.trim().toUpperCase() });
      setCode('');
    } catch (e) {
      onApply(null);
      setError(e instanceof ApiError ? e.message : 'Could not validate coupon.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRemove() {
    onApply(null);
    setError(null);
  }

  if (loading) return null;

  if (!firebaseUser) {
    return <p className="text-muted text-xs">Log in to apply a coupon code.</p>;
  }

  if (applied) {
    return (
      <div className="border-border bg-primary-50 flex items-center justify-between rounded-[10px] border px-3 py-2 text-sm">
        <span className="text-primary-700 font-medium">{applied.code} applied</span>
        <button
          type="button"
          onClick={handleRemove}
          className="text-primary-700 text-xs font-medium hover:underline"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label="Coupon code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="e.g. WELCOME10"
        error={error ?? undefined}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={submitting}
        onClick={handleApply}
        className="w-fit"
      >
        Apply
      </Button>
    </div>
  );
}
