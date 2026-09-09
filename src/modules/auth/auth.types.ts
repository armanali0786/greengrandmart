export type Role = 'customer' | 'staff' | 'admin';

export interface SessionUser {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  phone: string | null;
  phoneVerified: boolean;
  role: Role;
}
