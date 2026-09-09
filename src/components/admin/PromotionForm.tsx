'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toPaise } from '@/lib/money';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import type { CreatePromotionInput } from '@/modules/pricing/pricing.schema';
import type { PricingScope } from '@/modules/pricing/pricing.types';

// Same flattened-scope convention as CouponForm — product-level scoping
// isn't exposed in this minimal admin form (see that file's comment).
const promotionFormSchema = z.object({
  name: z.string().trim().min(1, 'Required.').max(200),
  type: z.enum(['category_discount', 'free_shipping']),
  discountType: z.enum(['percentage', 'fixed']).default('percentage'),
  value: z.coerce.number().positive().optional().or(z.literal('')),
  minCartValue: z.coerce.number().nonnegative().default(0),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  active: z.boolean().default(true),
  scopeType: z.enum(['all', 'categories', 'brands']).default('all'),
  categoryIds: z.array(z.string()).default([]),
  brandIds: z.array(z.string()).default([]),
});
export type PromotionFormValues = z.input<typeof promotionFormSchema>;
type PromotionFormOutput = z.output<typeof promotionFormSchema>;

export function toApiInput(values: PromotionFormOutput): CreatePromotionInput {
  const scope: PricingScope =
    values.scopeType === 'categories'
      ? { scope: 'categories', categoryIds: values.categoryIds }
      : values.scopeType === 'brands'
        ? { scope: 'brands', brandIds: values.brandIds }
        : { scope: 'all' };

  const rules: CreatePromotionInput['rules'] =
    values.type === 'free_shipping'
      ? { type: 'free_shipping', minCartValue: toPaise(values.minCartValue) }
      : {
          type: 'category_discount',
          discountType: values.discountType,
          value:
            values.discountType === 'fixed'
              ? toPaise(Number(values.value) || 0)
              : Number(values.value) || 0,
          scope,
        };

  return {
    name: values.name,
    rules,
    startsAt: values.startsAt ? new Date(values.startsAt) : undefined,
    expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
    active: values.active,
  };
}

export interface PromotionFormProps {
  categories: CategoryNode[];
  brands: BrandSummary[];
  defaultValues?: Partial<PromotionFormValues>;
  onSubmit: (input: CreatePromotionInput) => Promise<void>;
  submitLabel: string;
}

function flattenCategories(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

export function PromotionForm({
  categories,
  brands,
  defaultValues,
  onSubmit,
  submitLabel,
}: PromotionFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PromotionFormValues, unknown, PromotionFormOutput>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: {
      type: 'category_discount',
      discountType: 'percentage',
      minCartValue: 0,
      active: true,
      scopeType: 'all',
      categoryIds: [],
      brandIds: [],
      ...defaultValues,
    },
  });
  const type = watch('type');
  const discountType = watch('discountType');
  const scopeType = watch('scopeType');
  const flatCategories = flattenCategories(categories);

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(toApiInput(values)))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Input label="Name" error={errors.name?.message} {...register('name')} />

      <div>
        <label htmlFor="promoType" className="text-foreground mb-1.5 block text-sm font-medium">
          Type
        </label>
        <select
          id="promoType"
          {...register('type')}
          className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
        >
          <option value="category_discount">Discount off a scope</option>
          <option value="free_shipping">Free shipping</option>
        </select>
      </div>

      {type === 'category_discount' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="discountType"
                className="text-foreground mb-1.5 block text-sm font-medium"
              >
                Discount type
              </label>
              <select
                id="discountType"
                {...register('discountType')}
                className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <Input
              label={discountType === 'fixed' ? 'Amount off (₹)' : 'Percent off (%)'}
              type="number"
              step={discountType === 'fixed' ? '0.01' : '1'}
              error={errors.value?.message}
              {...register('value')}
            />
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
        </>
      ) : (
        <Input
          label="Free shipping above cart value (₹, 0 = always)"
          type="number"
          step="0.01"
          {...register('minCartValue')}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Starts (optional)" type="date" {...register('startsAt')} />
        <Input label="Expires (optional)" type="date" {...register('expiresAt')} />
      </div>

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
