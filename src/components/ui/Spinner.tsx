import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Standalone spinner for loading states that aren't a button (Button.tsx
 * has its own inline spinner) — a short, unpredictable-duration wait with
 * no known layout to skeleton. Pair with a `message` for anything the user
 * didn't just trigger themselves (context wouldn't otherwise be obvious).
 */
export function Spinner({ className, message }: { className?: string; message?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2', className)}>
      <Loader2 className="text-primary-600 h-5 w-5 animate-spin" aria-hidden="true" />
      {message && <span className="text-muted text-sm">{message}</span>}
      {!message && <span className="sr-only">Loading</span>}
    </div>
  );
}
