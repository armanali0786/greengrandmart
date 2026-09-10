'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/api-client';
import type { NotificationView } from '@/modules/notifications/notification.types';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'];

interface NotificationsPage {
  items: NotificationView[];
  total: number;
  unreadCount: number;
}

/** Polled (not real-time) — matches the docs' own cron-polling stance for background work in this codebase (no websockets/SSE anywhere). */
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => authFetch<NotificationsPage>('/api/notifications?limit=20'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authFetch(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authFetch('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}
