'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { requestPushToken } from '@/lib/firebase-client';
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type {
  NotificationPreferencesView,
  NotificationView,
} from '@/modules/notifications/notification.types';

interface NotificationsPage {
  items: NotificationView[];
  total: number;
  unreadCount: number;
}

const PREFERENCE_ROWS: { key: keyof NotificationPreferencesView; label: string }[] = [
  { key: 'emailOrderUpdates', label: 'Email — order updates' },
  { key: 'emailPromotions', label: 'Email — promotions' },
  { key: 'pushOrderUpdates', label: 'Push — order updates' },
  { key: 'pushPromotions', label: 'Push — promotions' },
];

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => authFetch<NotificationsPage>(`/api/notifications?page=${page}&limit=${limit}`),
  });

  const { data: preferences } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => authFetch<NotificationPreferencesView>('/api/notifications/preferences'),
  });

  const updatePreferences = useMutation({
    mutationFn: (patch: Partial<NotificationPreferencesView>) =>
      authFetch<NotificationPreferencesView>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => queryClient.setQueryData(['notification-preferences'], updated),
  });

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  async function handleEnablePush() {
    setPushStatus(null);
    setPushLoading(true);
    try {
      const token = await requestPushToken();
      if (!token) {
        setPushStatus(
          'Push notifications need browser permission — please allow notifications and try again.',
        );
        return;
      }
      await authFetch('/api/notifications/device-token', {
        method: 'POST',
        body: JSON.stringify({ fcmToken: token, platform: 'web' }),
      });
      setPushStatus('Push notifications enabled on this device.');
    } catch (e) {
      setPushStatus(e instanceof ApiError ? e.message : 'Could not enable push notifications.');
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Notifications</h2>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-primary-700 text-sm font-medium hover:underline disabled:opacity-50"
          >
            {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      <section className="border-border bg-surface rounded-[10px] border p-4">
        <h3 className="text-foreground mb-3 text-sm font-semibold">Preferences</h3>
        <div className="flex flex-col gap-2">
          {PREFERENCE_ROWS.map((row) => (
            <label key={row.key} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{row.label}</span>
              <input
                type="checkbox"
                checked={preferences?.[row.key] ?? true}
                onChange={(e) => updatePreferences.mutate({ [row.key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        <div className="border-border mt-4 border-t pt-4">
          <Button variant="secondary" loading={pushLoading} onClick={handleEnablePush}>
            Enable push notifications on this device
          </Button>
          {pushStatus && <p className="text-muted mt-2 text-xs">{pushStatus}</p>}
        </div>
      </section>

      <section className="border-border bg-surface rounded-[10px] border p-4">
        <h3 className="text-foreground mb-3 text-sm font-semibold">Recent activity</h3>
        {isLoading ? (
          <ul className="divide-border divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex flex-col gap-1.5 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-3 w-24" />
              </li>
            ))}
          </ul>
        ) : !data || data.items.length === 0 ? (
          <p className="text-muted text-sm">No notifications yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.read && markRead.mutate(n.id)}
                  disabled={markRead.isPending && markRead.variables === n.id}
                  className={`flex w-full flex-col gap-0.5 py-3 text-left text-sm disabled:opacity-60 ${n.read ? '' : 'bg-primary-50'}`}
                >
                  <span className="text-foreground font-medium">{n.title}</span>
                  <span className="text-muted text-xs">{n.body}</span>
                  <span className="text-muted text-xs">
                    {new Date(n.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > limit && (
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page * limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
