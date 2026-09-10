import type { NextRequest } from 'next/server';
import { requestOtpSchema } from '@/modules/otp/otp.schema';
import { requestOtp } from '@/modules/otp/otp.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = requestOtpSchema.parse(await req.json());
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const result = await requestOtp(body, ipAddress);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
