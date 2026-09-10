import type { NextRequest } from 'next/server';
import { verifyOtpSchema } from '@/modules/otp/otp.schema';
import { verifyOtp } from '@/modules/otp/otp.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = verifyOtpSchema.parse(await req.json());
    const result = await verifyOtp(body);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
