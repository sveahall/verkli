import { z } from "zod";
import { authorizeProductionEdition, loadProductionDraft, loadProductionArtwork, readProductionJson, ProductionError, productionErrorResponse } from "@/lib/book-production/server";
import { buildInteriorPdf, buildCoverPdf, PdfValidationError } from "@/features/book-production/pdf";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const limiter = createPerUserRateLimiter({ name: "book-production-export", maxPerMinute: 4 });
const requestSchema = z.object({
  versionId: z.string().uuid(),
  revision: z.number().int().positive(),
  kind: z.enum(["interior", "cover"]),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = requestSchema.safeParse(await readProductionJson(request, 2048));
    if (!parsed.success) throw new ProductionError(400, "INVALID_EXPORT", "Save your layout, then choose the interior or full cover to export.");
    const { id } = await params;
    const { versionId, revision, kind } = parsed.data;
    const context = await authorizeProductionEdition(id, versionId);
    const limit = await limiter.check(context.ownerId);
    if (!limit.allowed) throw new ProductionError(429, "EXPORT_RATE_LIMIT", "Please wait a minute before preparing another print file.");
    const draft = await loadProductionDraft(context);
    if (!draft.settings || draft.revision !== revision) throw new ProductionError(409, "LAYOUT_CHANGED", "This layout has changed. Reload and review the saved version before exporting.");

    async function readChapters() {
      const { data, count, error } = await context.supabase.from("chapters")
        .select("id, title, content, order", { count: "exact" })
        .eq("book_id", context.bookId).eq("book_version_id", versionId).is("deleted_at", null)
        .order("order", { ascending: true }).order("id", { ascending: true }).limit(501);
      if (error) {
        console.error("[book production export] chapter load failed", { bookId: id, versionId, code: error.code });
        throw new ProductionError(503, "CHAPTERS_UNAVAILABLE", "Your manuscript could not be loaded. Please try exporting again.");
      }
      if (!data || data.length > 500 || count !== data.length) throw new ProductionError(422, "MANUSCRIPT_TOO_LARGE", "The interior exporter supports up to 500 chapters. No partial manuscript was exported.");
      return data;
    }

    let result;
    let chapterSnapshot: string | null = null;
    if (kind === "interior") {
      const data = await readChapters();
      if (!data.length) throw new ProductionError(422, "EMPTY_MANUSCRIPT", "Add and save at least one chapter in Write before exporting the interior.");
      chapterSnapshot = JSON.stringify(data);
      result = await buildInteriorPdf(draft.settings, data.map((chapter, index) => ({
        id: chapter.id, title: chapter.title || `Chapter ${index + 1}`, content: chapter.content, order: chapter.order ?? index,
      })));
    } else {
      const artwork: Parameters<typeof buildCoverPdf>[1] = {};
      for (const side of ["front", "back"] as const) {
        const path = draft.settings.cover[side === "front" ? "frontPath" : "backPath"];
        if (path) artwork[side] = await loadProductionArtwork(context, path, side);
      }
      result = await buildCoverPdf(draft.settings, artwork);
    }

    // Never label a file as the current saved layout after a competing save.
    if (chapterSnapshot !== null && JSON.stringify(await readChapters()) !== chapterSnapshot) {
      throw new ProductionError(409, "MANUSCRIPT_CHANGED", "Your manuscript changed while the PDF was being prepared. Wait for chapter edits to save, then export again.");
    }
    const current = await loadProductionDraft(context);
    if (current.revision !== revision) throw new ProductionError(409, "LAYOUT_CHANGED", "The layout changed while the PDF was being prepared. Review the latest layout and export again.");
    return new Response(new Uint8Array(result.buffer), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="verkli-${kind}-${versionId}-r${revision}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Page-Count": String(result.pageCount),
      "X-Production-Warnings": JSON.stringify(result.warnings).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`),
    } });
  } catch (error) {
    if (error instanceof PdfValidationError) return productionErrorResponse(new ProductionError(422, "PRINT_PREFLIGHT", error.message));
    return productionErrorResponse(error);
  }
}
