'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toPaise } from '@/lib/money';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import type { CreateCouponInput } from '@/modules/pricing/pricing.schema';

// Rupee-facing form shape, same convention as ProductForm — the admin never
// types paise directly, and scope is flattened to a type + two id lists
// (a real multi-picker is Phase 10 polish; product-level scoping isn't
// exposed here at all, only category/brand — see CouponForm's module
// comment below).
const couponFormSchema = z.object({
  code: z.string().trim().min(3, 'At least 3 characters.').max(40),
  type: z.enum(['percentage', 'fixed']),
  value: z.coerce.number().positive('Required.'),
  maxDiscount: z.coerce.number().positive().optional().or(z.literal('')),
  minCartValue: z.coerce.number().nonnegative().default(0),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  usageLimitTotal: z.coerce.number().int().positive().optional().or(z.literal('')),
  firstOrderOnly: z.boolean().default(false),
  active: z.boolean().default(true),
  scopeType: z.enum(['all', 'categories', 'brands']).default('all'),
  categoryIds: z.array(z.string()).default([]),
  brandIds: z.array(z.string()).default([]),
});
export type CouponFormValues = z.input<typeof couponFormSchema>;
type CouponFormOutput = z.output<typeof couponFormSchema>;

export function toApiInput(values: CouponFormOutput): CreateCouponInput {
  const appliesTo: CreateCouponInput['appliesTo'] =
    values.scopeType === 'categories'
      ? { scope: 'categories', categoryIds: values.categoryIds }
      : values.scopeType === 'brands'
        ? { scope: 'brands', brandIds: values.brandIds }
        : { scope: 'all' };

  return {
    code: values.code,
    type: values.type,
    value: values.type === 'fixed' ? toPaise(values.value) : values.value,
    maxDiscount:
      values.maxDiscount === '' || values.maxDiscount === undefined
        ? undefined
        : toPaise(values.maxDiscount),
    minCartValue: toPaise(values.minCartValue),
    startsAt: values.startsAt ? new Date(values.startsAt) : undefined,
    expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
    usageLimitTotal:
      values.usageLimitTotal === '' || values.usageLimitTotal === undefined
        ? undefined
        : values.usageLimitTotal,
    usageLimitPerUser: 1,
    firstOrderOnly: values.firstOrderOnly,
    appliesTo,
    active: values.active,
  };
}

export interface CouponFormProps {
  categories: CategoryNode[];
  brands: BrandSummary[];
  defaultValues?: Partial<CouponFormValues>;
  onSubmit: (input: CreateCouponInput) => Promise<void>;
  submitLabel: string;
}

function flattenCategories(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

export function CouponForm({
  categories,
  brands,
  defaultValues,
  onSubmit,
  submitLabel,
}: CouponFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues, unknown, CouponFormOutput>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      type: 'percentage',
      minCartValue: 0,
      firstOrderOnly: false,
      active: true,
      scopeType: 'all',
      categoryIds: [],
      brandIds: [],
      ...defaultValues,
    },
  });
  const type = watch('type');
  const scopeType = watch('scopeType');
  const flatCategories = flattenCategories(categories);

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(toApiInput(values)))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Input label="Code" error={errors.code?.message} {...register('code')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="text-foreground mb-1.5 block text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            {...register('type')}
            className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>
        <Input
          label={type === 'fixed' ? 'Amount off (₹)' : 'Percent off (%)'}
          type="number"
          step={type === 'fixed' ? '0.01' : '1'}
          error={errors.value?.message}
          {...register('value')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Max discount cap (₹, optional)"
          type="number"
          step="0.01"
          {...register('maxDiscount')}
        />
        <Input
          label="Minimum cart value (₹)"
          type="number"
          step="0.01"
          error={errors.minCartValue?.message}
          {...register('minCartValue')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Starts (optional)" type="date" {...register('startsAt')} />
        <Input label="Expires (optional)" type="date" {...register('expiresAt')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Total usage limit (optional)"
          type="number"
          {...register('usageLimitTotal')}
        />
        <label className="text-foreground mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" {...register('firstOrderOnly')} />
          First order only
        </label>
      </div>

      <div>
        <label htmlFor="scopeType" className="text-foreground mb-1.5 block text-sm font-medium">
          Applies to
        </label>
        <select
          id="scopeType"
          {...register('scopeType')}
          className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
        >
          <option value="all">Everything</option>
          <option value="categories">Specific categories</option>
          <option value="brands">Specific brands</option>
        </select>
      </div>

      {scopeType === 'categories' && (
        <select
          multiple
          {...register('categoryIds')}
          className="border-border bg-surface h-32 w-full rounded-[10px] border px-3 py-2 text-sm"
        >
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {scopeType === 'brands' && (
        <select
          multiple
          {...register('brandIds')}
          className="border-border bg-surface h-32 w-full rounded-[10px] border px-3 py-2 text-sm"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      <label className="text-foreground flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" {...register('active')} />
        Active
      </label>

      <Button type="submit" loading={isSubmitting} className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
