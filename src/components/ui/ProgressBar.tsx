import { cn } from '@/lib/cn';

/**
 * Determinate linear progress — only for operations where a real percentage
 * is known (file upload/download byte counts). Don't use this for
 * unknown-duration work; that's Spinner's job.
 */
export function ProgressBar({
  percent,
  label,
  className,
}: {
  percent: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <div className="text-muted flex justify-between text-xs">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-primary-50 h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary-600 h-full rounded-full transition-[width] duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** Indeterminate variant — work is happening but no percentage is knowable. */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn('bg-primary-50 h-1 w-full overflow-hidden rounded-full', className)}
    >
      <div className="bg-primary-600 h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full" />
    </div>
  );
}
