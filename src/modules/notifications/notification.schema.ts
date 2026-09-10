import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const registerDeviceTokenSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.enum(['web', 'android', 'ios']),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

export const updatePreferencesSchema = z.object({
  emailOrderUpdates: z.boolean().optional(),
  emailPromotions: z.boolean().optional(),
  pushOrderUpdates: z.boolean().optional(),
  pushPromotions: z.boolean().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
