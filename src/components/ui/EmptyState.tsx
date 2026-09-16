import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Use inside a table/list container instead of a full standalone page section. */
  compact?: boolean;
}

// Shared empty-state pattern (icon + title + description + optional CTA),
// extracted from the layout `cart`'s empty-cart view already used app-wide.
export function EmptyState({ icon: Icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center gap-3 px-4 py-12 text-center'
          : 'mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6'
      }
    >
      <Icon className="text-muted h-12 w-12" aria-hidden="true" />
      <h2 className="text-foreground text-xl font-semibold">{title}</h2>
      {description && <p className="text-muted text-sm">{description}</p>}
      {action}
    </div>
  );
}
