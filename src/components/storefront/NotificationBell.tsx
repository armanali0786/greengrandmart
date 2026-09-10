'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications';

/** docs/UX_UI_Spec.md's "notification bell" nav item + Product_Spec_Requirements.md §10.3's in-app notification center — dropdown here, "view all" link to a dedicated page for the full paginated list. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Always enabled (not gated on `open`) so the unread badge count is
  // current even before the dropdown is ever opened.
  const { data } = useNotifications(true);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground hover:text-primary-700 relative flex items-center"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="bg-primary-600 absolute -top-2 -right-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="border-border bg-surface absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-[10px] border shadow-lg">
          <div className="border-border flex items-center justify-between border-b p-3">
            <span className="text-foreground text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-primary-700 text-xs font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {!data || data.items.length === 0 ? (
            <p className="text-muted p-4 text-center text-sm">No notifications yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.read && markRead.mutate(n.id)}
                    className={`flex w-full flex-col gap-0.5 p-3 text-left text-sm ${n.read ? '' : 'bg-primary-50'}`}
                  >
                    <span className="text-foreground font-medium">{n.title}</span>
                    <span className="text-muted text-xs">{n.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/account/notifications"
            className="text-primary-700 border-border block border-t p-3 text-center text-sm font-medium hover:underline"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
