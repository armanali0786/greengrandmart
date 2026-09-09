import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// Always renders a real <label> (docs/UX_UI_Spec.md accessibility: "<label>
// elements required, not placeholder-only") and reserves space for the error
// message so validation doesn't cause layout shift.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-foreground text-sm font-medium">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'border-border bg-surface text-foreground placeholder:text-muted h-11 rounded-[10px] border px-3 text-sm',
            'focus:border-primary-600 focus:ring-primary-500/30 focus:ring-2 focus:outline-none',
            'disabled:bg-primary-50/50 disabled:text-muted disabled:cursor-not-allowed',
            error && 'border-error focus:border-error focus:ring-error/20',
            className,
          )}
          {...props}
        />
        <p id={errorId} className="text-error min-h-[1.1rem] text-xs">
          {error}
        </p>
      </div>
    );
  },
);
Input.displayName = 'Input';
