'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * docs/UX_UI_Spec.md "Modal": confirm dialogs do NOT close on backdrop
   * click — pass true for any destructive-action confirmation.
   */
  preventBackdropClose?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  preventBackdropClose,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={preventBackdropClose ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // max-h + overflow-y-auto: a long form (e.g. the address form)
          // must scroll within the modal instead of overflowing the
          // viewport with its submit button unreachable.
          'bg-surface flex max-h-[90vh] w-full max-w-md flex-col rounded-[10px] shadow-lg focus:outline-none',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between p-6 pb-4">
          <h2 id="modal-title" className="text-foreground text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="icon-button text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
