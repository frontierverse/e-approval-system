import { requireUser } from "@/lib/auth";
import { createCafeItemInventoryPdf } from "@/lib/cafe-item-inventory-pdf";
import { getCafeItemInventoryItems } from "@/lib/cafe-items";
import { getCafeItemToday } from "@/lib/cafe-items-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await requireUser();

  const generatedAt = new Date();
  const today = getCafeItemToday();
  const items = await getCafeItemInventoryItems();
  const pdf = await createCafeItemInventoryPdf({
    generatedAt,
    items,
    today,
  });

  return createPdfResponse(pdf, `cafe-items-${today}.pdf`);
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
