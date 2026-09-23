import { z } from "zod";
import { exportFormatSchema } from "@/lib/audiobook/export-contract";
import { createSyntheticExport } from "@/lib/audiobook/export-fixture";
export const runtime = "nodejs";
const requestSchema = z.object({ format: exportFormatSchema, scenario: z.enum(["complete", "missing", "encoder-error", "size-limit"]) }).strict();
let encoding = false;
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 500) { await reader.cancel(); throw new SyntaxError("Request body too large"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found." }, { status: 404 });
  let claimed = false;
  try {
    const body = await readBody(request);
    const parsed = requestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return Response.json({ error: "Choose a supported fixture and export format." }, { status: 400 });
    if (encoding) return Response.json({ error: "Another local export is running. Please try again shortly." }, { status: 429, headers: { "Cache-Control": "no-store" } });
    encoding = true; claimed = true;
    const result = await createSyntheticExport(parsed.data.format, parsed.data.scenario, request.signal);
    return new Response(new Uint8Array(result.audio), { headers: {
      "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="synthetic-vagen-hem-${parsed.data.format}.${result.extension}"`, "Cache-Control": "no-store",
      "X-Export-Filename": `synthetic-vagen-hem-${parsed.data.format}.${result.extension}`, "X-Export-Duration": String(result.durationSeconds), "X-Export-Chapters": String(result.chapters.length),
    } });
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: "Export cancelled." }, { status: 499 });
    if (error instanceof SyntaxError) return Response.json({ error: "Send a valid local export request." }, { status: 400 });
    console.error("[audiobook export] synthetic export failed");
    return Response.json({ error: error instanceof Error ? error.message : "The local export failed. No download was published." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  } finally { if (claimed) encoding = false; }
}
