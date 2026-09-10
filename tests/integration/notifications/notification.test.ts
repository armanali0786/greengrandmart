import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { emailProvider } from '@/modules/notifications/email-provider';
import { pushProvider } from '@/modules/notifications/push-provider';
import {
  getPreferences,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  registerDeviceToken,
  sendEmailForTrigger,
  sendPushForTrigger,
  updatePreferences,
} from '@/modules/notifications/notification.service';

describe('notification.service.sendEmailForTrigger', () => {
  it('creates an in-app notification and sends email when the preference is enabled', async () => {
    const user = await createTestUser();
    try {
      const spy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue();

      await sendEmailForTrigger({ trigger: 'welcome', userId: user.id });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].to).toBe(user.email);

      const notifications = await db.notification.findMany({ where: { userId: user.id } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('welcome');

      spy.mockRestore();
    } finally {
      await db.notification.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });

  it('still creates the in-app row but skips the email when emailOrderUpdates is disabled', async () => {
    const user = await createTestUser();
    try {
      await updatePreferences(user, { emailOrderUpdates: false });
      const spy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue();

      await sendEmailForTrigger({ trigger: 'order_confirmed', userId: user.id });

      expect(spy).not.toHaveBeenCalled();
      const notifications = await db.notification.findMany({ where: { userId: user.id } });
      expect(notifications).toHaveLength(1);

      spy.mockRestore();
    } finally {
      await db.notification.deleteMany({ where: { userId: user.id } });
      await db.notificationPreference.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });

  it('welcome is never gated by preferences (no "account" category exists)', async () => {
    const user = await createTestUser();
    try {
      await updatePreferences(user, { emailOrderUpdates: false, emailPromotions: false });
      const spy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue();

      await sendEmailForTrigger({ trigger: 'welcome', userId: user.id });
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    } finally {
      await db.notification.deleteMany({ where: { userId: user.id } });
      await db.notificationPreference.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });
});

describe('notification.service.sendPushForTrigger', () => {
  it('sends to every registered device token and does not create a duplicate in-app row', async () => {
    const user = await createTestUser();
    try {
      await registerDeviceToken(user, { fcmToken: `tok_${user.id}`, platform: 'web' });
      const spy = vi.spyOn(pushProvider, 'sendPush').mockResolvedValue({ invalidTokens: [] });

      await sendPushForTrigger({ trigger: 'order_confirmed', userId: user.id });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].fcmTokens).toEqual([`tok_${user.id}`]);

      const notifications = await db.notification.findMany({ where: { userId: user.id } });
      expect(notifications).toHaveLength(0);

      spy.mockRestore();
    } finally {
      await db.deviceToken.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });

  it('is a no-op when the user has no registered device tokens', async () => {
    const user = await createTestUser();
    try {
      const spy = vi.spyOn(pushProvider, 'sendPush').mockResolvedValue({ invalidTokens: [] });
      await sendPushForTrigger({ trigger: 'order_confirmed', userId: user.id });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('prunes tokens the push provider reports as invalid', async () => {
    const user = await createTestUser();
    const token = `tok_${user.id}`;
    try {
      await registerDeviceToken(user, { fcmToken: token, platform: 'web' });
      const spy = vi.spyOn(pushProvider, 'sendPush').mockResolvedValue({ invalidTokens: [token] });

      await sendPushForTrigger({ trigger: 'order_confirmed', userId: user.id });

      expect(await db.deviceToken.findFirst({ where: { fcmToken: token } })).toBeNull();
      spy.mockRestore();
    } finally {
      await db.deviceToken.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });
});

describe('notification.service — customer-facing API', () => {
  it('lists, marks one read, and marks all read', async () => {
    const user = await createTestUser();
    try {
      const spy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue();
      await sendEmailForTrigger({ trigger: 'welcome', userId: user.id });
      await sendEmailForTrigger({ trigger: 'order_confirmed', userId: user.id });
      spy.mockRestore();

      const page = await listNotificationsForUser(user, { page: 1, limit: 20 });
      expect(page.total).toBe(2);
      expect(page.unreadCount).toBe(2);

      await markNotificationRead(user, page.items[0].id);
      const afterOne = await listNotificationsForUser(user, { page: 1, limit: 20 });
      expect(afterOne.unreadCount).toBe(1);

      await markAllNotificationsRead(user);
      const afterAll = await listNotificationsForUser(user, { page: 1, limit: 20 });
      expect(afterAll.unreadCount).toBe(0);
    } finally {
      await db.notification.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });

  it('getPreferences lazily creates a default row', async () => {
    const user = await createTestUser();
    try {
      expect(await db.notificationPreference.findUnique({ where: { userId: user.id } })).toBeNull();
      const prefs = await getPreferences(user);
      expect(prefs).toEqual({
        emailOrderUpdates: true,
        emailPromotions: true,
        pushOrderUpdates: true,
        pushPromotions: true,
      });
      expect(
        await db.notificationPreference.findUnique({ where: { userId: user.id } }),
      ).not.toBeNull();
    } finally {
      await db.notificationPreference.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });
});
