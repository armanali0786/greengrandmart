'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toPaise } from '@/lib/money';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import type { CreateProductInput } from '@/modules/catalog/catalog.schema';

// Rupee-facing form shape: prices are entered in ₹ (decimal) and attributes
// as a simple "key:value, key:value" string — converted to the paise-integer
// / jsonb-object shapes the API (CreateProductInput) actually expects on
// submit, keeping the admin from ever typing paise directly.
const variantFormSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1, 'SKU is required.'),
  attributesText: z.string().trim().optional(),
  price: z.coerce.number().min(0, 'Price is required.'),
  salePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  initialStock: z.coerce.number().int().min(0).default(0),
});

const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only.'),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.coerce.number().min(0, 'Base price is required.'),
  salePrice: z.coerce.number().min(0).optional().or(z.literal('')),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().optional(),
  isFeatured: z.boolean().default(false),
  status: z.enum(['draft', 'active']).default('draft'),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  variants: z.array(variantFormSchema).min(1, 'At least one variant is required.'),
});
export type ProductFormValues = z.input<typeof productFormSchema>;
type ProductFormOutput = z.output<typeof productFormSchema>;

function parseAttributes(text?: string): Record<string, string> {
  if (!text) return {};
  const attrs: Record<string, string> = {};
  for (const pair of text.split(',')) {
    const [key, value] = pair.split(':').map((s) => s.trim());
    if (key && value) attrs[key] = value;
  }
  return attrs;
}

function attributesToText(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
}

export function toApiInput(values: ProductFormOutput): CreateProductInput {
  return {
    name: values.name,
    slug: values.slug,
    categoryId: values.categoryId || undefined,
    brandId: values.brandId || undefined,
    shortDescription: values.shortDescription || undefined,
    description: values.description || undefined,
    basePrice: toPaise(values.basePrice),
    salePrice:
      values.salePrice === '' || values.salePrice === undefined
        ? undefined
        : toPaise(values.salePrice),
    gstRate: values.gstRate,
    hsnCode: values.hsnCode || undefined,
    isFeatured: values.isFeatured,
    status: values.status,
    seoTitle: values.seoTitle || undefined,
    seoDescription: values.seoDescription || undefined,
    variants: values.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: parseAttributes(v.attributesText),
      price: toPaise(v.price),
      salePrice: v.salePrice === '' || v.salePrice === undefined ? undefined : toPaise(v.salePrice),
      initialStock: v.initialStock,
    })),
  };
}

export interface ProductFormProps {
  categories: CategoryNode[];
  brands: BrandSummary[];
  defaultValues?: Partial<ProductFormValues>;
  onSubmit: (input: CreateProductInput) => Promise<void>;
  submitLabel: string;
  /** Editing an existing product's stock is Phase 4's job (inventory adjustments need a reason/audit trail) — locked here. */
  lockStock?: boolean;
}

function flattenCategories(nodes: CategoryNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

export function ProductForm({
  categories,
  brands,
  defaultValues,
  onSubmit,
  submitLabel,
  lockStock,
}: ProductFormProps) {
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      status: 'draft',
      isFeatured: false,
      gstRate: 0,
      variants: [{ sku: '', attributesText: '', price: 0, initialStock: 0 }],
      ...defaultValues,
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });
  const flatCategories = flattenCategories(categories);

  function suggestSlug() {
    const slug = (getValues('name') ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setValue('slug', slug, { shouldValidate: true });
  }

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(toApiInput(values)))}
      noValidate
      className="flex flex-col gap-8"
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-base font-semibold">Basic info</h2>
        <Input
          label="Name"
          error={errors.name?.message}
          {...register('name')}
          onBlur={suggestSlug}
        />
        <Input label="Slug" error={errors.slug?.message} {...register('slug')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="categoryId"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              Category
            </label>
            <select
              id="categoryId"
              {...register('categoryId')}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              <option value="">None</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="brandId" className="text-foreground mb-1.5 block text-sm font-medium">
              Brand
            </label>
            <select
              id="brandId"
              {...register('brandId')}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input label="Short description" {...register('shortDescription')} />
        <div>
          <label htmlFor="description" className="text-foreground mb-1.5 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            {...register('description')}
            className="border-border bg-surface w-full rounded-[10px] border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-6">
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register('isFeatured')} />
            Featured
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="status" className="text-foreground text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="border-border bg-surface h-9 rounded-[10px] border px-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-base font-semibold">Pricing &amp; tax</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Base price (₹)"
            type="number"
            step="0.01"
            error={errors.basePrice?.message}
            {...register('basePrice')}
          />
          <Input
            label="Sale price (₹, optional)"
            type="number"
            step="0.01"
            {...register('salePrice')}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="GST rate (%)" type="number" step="0.01" {...register('gstRate')} />
          <Input label="HSN code" {...register('hsnCode')} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-base font-semibold">Variants</h2>
          {!lockStock && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ sku: '', attributesText: '', price: 0, initialStock: 0 })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add variant
            </Button>
          )}
        </div>
        {errors.variants?.root && (
          <p className="text-error text-sm">{errors.variants.root.message}</p>
        )}
        <div className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="border-border grid grid-cols-1 gap-3 rounded-[10px] border p-3 sm:grid-cols-6"
            >
              <div className="sm:col-span-2">
                <Input
                  label="SKU"
                  error={errors.variants?.[index]?.sku?.message}
                  {...register(`variants.${index}.sku`)}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Attributes (size:M, color:Black)"
                  {...register(`variants.${index}.attributesText`)}
                />
              </div>
              <Input
                label="Price (₹)"
                type="number"
                step="0.01"
                error={errors.variants?.[index]?.price?.message}
                {...register(`variants.${index}.price`)}
              />
              {lockStock ? (
                <div className="text-muted flex items-end pb-2.5 text-sm">
                  Stock managed in Inventory
                </div>
              ) : (
                <Input
                  label="Initial stock"
                  type="number"
                  {...register(`variants.${index}.initialStock`)}
                />
              )}
              {!lockStock && fields.length > 1 && (
                <div className="flex justify-end sm:col-span-6">
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-base font-semibold">SEO</h2>
        <Input label="SEO title" {...register('seoTitle')} />
        <Input label="SEO description" {...register('seoDescription')} />
      </section>

      <Button type="submit" loading={isSubmitting} className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}

export { attributesToText };
