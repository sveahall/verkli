import { NextResponse } from "next/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  authorizeProductionEdition, MAX_PRINT_ARTWORK_BYTES, ProductionError,
  productionErrorResponse, readProductionBody, uploadProductionArtwork,
} from "@/lib/book-production/server";

export const runtime = "nodejs";
const artworkLimiter = createPerUserRateLimiter({ name: "book-production-artwork-upload", maxPerMinute: 6 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await authorizeProductionEdition(id, new URL(request.url).searchParams.get("versionId") ?? "");
    const rate = await artworkLimiter.check(context.ownerId);
    if (!rate.allowed) {
      const retryAfter = rate.retryAfterSeconds ?? 60;
      const response = productionErrorResponse(new ProductionError(429, "PRODUCTION_ARTWORK_RATE_LIMITED", `Wait ${retryAfter} seconds before uploading more print artwork.`));
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }
    const body = await readProductionBody(request, MAX_PRINT_ARTWORK_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(new Uint8Array(body), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new ProductionError(400, "PRODUCTION_ARTWORK_FORM_INVALID", "Select one JPG or PNG file and its cover side."); }
    const file = form.get("file");
    const side = form.get("side");
    if (!(file instanceof File) || (side !== "front" && side !== "back") || form.getAll("file").length !== 1 || form.getAll("side").length !== 1 || Array.from(form.keys()).some((key) => key !== "file" && key !== "side")) {
      throw new ProductionError(400, "PRODUCTION_ARTWORK_FORM_INVALID", "Select one JPG or PNG file and choose its front or back cover side.");
    }
    const artwork = await uploadProductionArtwork(context, file, side);
    return NextResponse.json(artwork, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return productionErrorResponse(error); }
}
