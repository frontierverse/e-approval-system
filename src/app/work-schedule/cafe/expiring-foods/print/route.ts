import { requireUser } from "@/lib/auth";
import { createCafeExpiringFoodsPdf } from "@/lib/cafe-item-expiration-pdf";
import { getCafeItemsExpiringWithin } from "@/lib/cafe-items";
import { getCafeItemToday } from "@/lib/cafe-items-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const expiringFoodPrintDays = 15;

export async function GET() {
  await requireUser();

  const today = getCafeItemToday();
  const items = await getCafeItemsExpiringWithin({
    days: expiringFoodPrintDays,
    today,
  });
  const pdf = await createCafeExpiringFoodsPdf({
    days: expiringFoodPrintDays,
    items,
    today,
  });

  return createPdfResponse(pdf, `cafe-expiring-foods-${today}.pdf`);
}

function createPdfResponse(pdf: Uint8Array, filename: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,
      "Content-Type": "application/pdf",
    },
  });
}
