import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  read: boolean;
  createdAt: Date;
}

export async function createNotificationRow(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: object;
}): Promise<void> {
  await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: (params.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function findNotificationsForUser(
  userId: string,
  params: { page: number; limit: number },
): Promise<{ rows: NotificationRow[]; total: number; unreadCount: number }> {
  const where: Prisma.NotificationWhereInput = { userId };
  const [rows, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, read: false } }),
  ]);
  return { rows, total, unreadCount };
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const result = await db.notification.updateMany({ where: { id, userId }, data: { read: true } });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

export async function upsertDeviceToken(
  userId: string,
  fcmToken: string,
  platform: string,
): Promise<void> {
  // fcm_token is globally UNIQUE (a token can migrate to a different user
  // on the same browser/device — e.g. a shared computer, a re-login) —
  // upsert by token, not by (user, token), so the row always reflects the
  // token's current owner.
  await db.deviceToken.upsert({
    where: { fcmToken },
    create: { userId, fcmToken, platform },
    update: { userId, platform },
  });
}

export async function findDeviceTokensForUser(userId: string): Promise<string[]> {
  const rows = await db.deviceToken.findMany({ where: { userId }, select: { fcmToken: true } });
  return rows.map((r) => r.fcmToken);
}

export async function deleteDeviceTokens(fcmTokens: string[]): Promise<void> {
  if (fcmTokens.length === 0) return;
  await db.deviceToken.deleteMany({ where: { fcmToken: { in: fcmTokens } } });
}

const PREFERENCE_DEFAULTS = {
  emailOrderUpdates: true,
  emailPromotions: true,
  pushOrderUpdates: true,
  pushPromotions: true,
};

export interface PreferencesRow {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  pushOrderUpdates: boolean;
  pushPromotions: boolean;
}

const PREFERENCES_SELECT = {
  emailOrderUpdates: true,
  emailPromotions: true,
  pushOrderUpdates: true,
  pushPromotions: true,
} satisfies Prisma.NotificationPreferenceSelect;

/** Lazily created — see the Data_Model_DB_Schema.md §10 addendum: no row exists until first read/write. */
export async function findOrCreatePreferences(userId: string): Promise<PreferencesRow> {
  const existing = await db.notificationPreference.findUnique({
    where: { userId },
    select: PREFERENCES_SELECT,
  });
  if (existing) return existing;
  return db.notificationPreference.create({
    data: { userId, ...PREFERENCE_DEFAULTS },
    select: PREFERENCES_SELECT,
  });
}

export async function updatePreferences(
  userId: string,
  patch: Partial<PreferencesRow>,
): Promise<PreferencesRow> {
  return db.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...PREFERENCE_DEFAULTS, ...patch },
    update: patch,
    select: PREFERENCES_SELECT,
  });
}
