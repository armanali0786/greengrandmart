export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferencesView {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
  pushOrderUpdates: boolean;
  pushPromotions: boolean;
}
