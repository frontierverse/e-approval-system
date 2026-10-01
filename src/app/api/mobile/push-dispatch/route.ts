import { mobileJson } from "@/lib/mobile-auth";
import { dispatchMobilePushDeliveries } from "@/lib/mobile-push";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return mobileJson({ error: "접근 권한이 없습니다." }, 401);
  }
  const result = await dispatchMobilePushDeliveries();
  return mobileJson(result);
}
