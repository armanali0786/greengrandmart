// Matches the DB CHECK constraint chk_otp_requests_purpose. Only
// 'cod_confirmation' has any described flow anywhere in the docs —
// 'phone_verification' is schema-level forward-compat for a future
// "verify phone in account settings" feature that isn't specified; not
// built this phase.
export type OtpPurpose = 'cod_confirmation' | 'phone_verification';

export interface RequestOtpResult {
  sent: boolean;
  expiresInSeconds: number;
}

export interface VerifyOtpResult {
  verified: true;
  verificationId: string;
}
