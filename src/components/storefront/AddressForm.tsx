'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { addressSchema, type AddressInput } from '@/modules/auth/address.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// addressSchema's isDefaultShipping/isDefaultBilling use `.optional().default(false)`,
// so the pre-parse (form field) shape and the post-parse (submit handler)
// shape genuinely differ — react-hook-form's 3-generic form models exactly
// that split (TFieldValues = input, TTransformedValues = resolver output).
type AddressFormValues = z.input<typeof addressSchema>;

export interface AddressFormProps {
  defaultValues?: Partial<AddressFormValues>;
  onSubmit: (input: AddressInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function AddressForm({ defaultValues, onSubmit, onCancel, submitLabel }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues, unknown, AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      country: 'IN',
      isDefaultShipping: false,
      isDefaultBilling: false,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Input label="Full name" error={errors.name?.message} {...register('name')} />
      <Input
        label="Phone"
        type="tel"
        placeholder="9876543210"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input label="Address line 1" error={errors.line1?.message} {...register('line1')} />
      <Input
        label="Address line 2 (optional)"
        error={errors.line2?.message}
        {...register('line2')}
      />
      <Input
        label="Landmark (optional)"
        error={errors.landmark?.message}
        {...register('landmark')}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input label="City" error={errors.city?.message} {...register('city')} />
        <Input label="State" error={errors.state?.message} {...register('state')} />
      </div>
      <Input
        label="PIN code"
        inputMode="numeric"
        error={errors.postalCode?.message}
        {...register('postalCode')}
      />

      <label className="text-foreground flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" {...register('isDefaultShipping')} />
        Set as default shipping address
      </label>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" {...register('isDefaultBilling')} />
        Set as default billing address
      </label>

      <div className="mt-2 flex gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
