import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import type { SessionUser } from '@/modules/auth/auth.types';
import type { NotificationJobPayload } from '@/modules/jobs/job.types';
import { buildNotificationContent } from '@/modules/notifications/notification-templates';
import { emailProvider } from '@/modules/notifications/email-provider';
import { pushProvider } from '@/modules/notifications/push-provider';
import * as repo from '@/modules/notifications/notification.repository';
import type {
  ListNotificationsQuery,
  RegisterDeviceTokenInput,
  UpdatePreferencesInput,
} from '@/modules/notifications/notification.schema';
import type {
  NotificationPreferencesView,
  NotificationView,
} from '@/modules/notifications/notification.types';

/** `welcome` isn't opt-out-able (no "account" category exists in the 2-category preference model — order updates, promotions) — every other trigger is an order-lifecycle event. */
function isOrderUpdatesTrigger(trigger: NotificationJobPayload['trigger']): boolean {
  return trigger !== 'welcome';
}

async function loadContext(
  payload: NotificationJobPayload,
): Promise<{ email: string; userName: string; orderNumber?: string; grandTotal?: number }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: payload.userId } });
  if (!payload.orderId) {
    return { email: user.email, userName: user.name };
  }
  const order = await db.order.findUnique({ where: { id: payload.orderId } });
  return {
    email: user.email,
    userName: user.name,
    orderNumber: order?.orderNumber,
    grandTotal: order?.grandTotal,
  };
}

/**
 * Job dispatcher entrypoint for `send_email` (job.service.ts). Always
 * records the in-app notification-center row regardless of the user's
 * email preference (docs/Product_Spec_Requirements.md §10.3 treats the
 * in-app center as its own channel, not gated by the email toggle) — the
 * email send itself is what respects `emailOrderUpdates`. `send_push`
 * (below) does not also create an in-app row, to avoid a duplicate for the
 * same event (both jobs are always enqueued together at every trigger
 * site — see payment/order/return/refund service call sites).
 */
export async function sendEmailForTrigger(payload: NotificationJobPayload): Promise<void> {
  const ctx = await loadContext(payload);
  const { title, body } = buildNotificationContent(payload.trigger, ctx);

  await repo.createNotificationRow({
    userId: payload.userId,
    type: payload.trigger,
    title,
    body,
    data: payload.orderId ? { orderId: payload.orderId } : undefined,
  });

  if (isOrderUpdatesTrigger(payload.trigger)) {
    const prefs = await repo.findOrCreatePreferences(payload.userId);
    if (!prefs.emailOrderUpdates) return;
  }

  await emailProvider.sendEmail({ to: ctx.email, subject: title, html: `<p>${body}</p>` });
}

export async function sendPushForTrigger(payload: NotificationJobPayload): Promise<void> {
  if (isOrderUpdatesTrigger(payload.trigger)) {
    const prefs = await repo.findOrCreatePreferences(payload.userId);
    if (!prefs.pushOrderUpdates) return;
  }

  const tokens = await repo.findDeviceTokensForUser(payload.userId);
  if (tokens.length === 0) return;

  const ctx = await loadContext(payload);
  const { title, body } = buildNotificationContent(payload.trigger, ctx);
  const { invalidTokens } = await pushProvider.sendPush({ fcmTokens: tokens, title, body });
  if (invalidTokens.length > 0) {
    await repo.deleteDeviceTokens(invalidTokens);
  }
}

// ── Customer-facing API ────────────────────────────────────────────────

export async function listNotificationsForUser(
  user: SessionUser,
  query: ListNotificationsQuery,
): Promise<{
  items: NotificationView[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}> {
  const { rows, total, unreadCount } = await repo.findNotificationsForUser(user.id, query);
  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: r.data as Record<string, unknown>,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    limit: query.limit,
    total,
    unreadCount,
  };
}

export async function markNotificationRead(user: SessionUser, id: string): Promise<void> {
  const updated = await repo.markNotificationRead(user.id, id);
  if (!updated) throw new NotFoundError('Notification not found.');
}

export async function markAllNotificationsRead(user: SessionUser): Promise<void> {
  await repo.markAllNotificationsRead(user.id);
}

export async function registerDeviceToken(
  user: SessionUser,
  input: RegisterDeviceTokenInput,
): Promise<void> {
  await repo.upsertDeviceToken(user.id, input.fcmToken, input.platform);
}

export async function getPreferences(user: SessionUser): Promise<NotificationPreferencesView> {
  return repo.findOrCreatePreferences(user.id);
}

export async function updatePreferences(
  user: SessionUser,
  input: UpdatePreferencesInput,
): Promise<NotificationPreferencesView> {
  return repo.updatePreferences(user.id, input);
}
