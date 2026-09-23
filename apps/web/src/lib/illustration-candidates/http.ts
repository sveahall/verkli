import { intentSchema } from "@/features/illustration-candidates/contracts";
import { CandidateError, MAX_IMAGE_BYTES } from "./service";

export const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 12 * 1024;
const tooLarge = () => new CandidateError(413, "BODY_TOO_LARGE", "Choose an image up to 10 MB with a shorter description.");
const invalid = () => new CandidateError(400, "INVALID_REQUEST", "Send one PNG or JPEG and a complete candidate description.");

export async function readCandidateBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw invalid();
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const form = await new Request("http://localhost/", { method: "POST", headers: { "Content-Type": request.headers.get("content-type")! }, body: new Uint8Array(Buffer.concat(chunks)) }).formData();
    if ([...form.keys()].length !== 2 || form.getAll("file").length !== 1 || form.getAll("intent").length !== 1) throw invalid();
    const file = form.get("file"); const raw = form.get("intent");
    if (!(file instanceof File) || typeof raw !== "string" || Buffer.byteLength(raw) > 8 * 1024) throw invalid();
    if (file.size > MAX_IMAGE_BYTES) throw tooLarge();
    const intent = intentSchema.safeParse(JSON.parse(raw));
    if (!intent.success) throw invalid();
    return { intent: intent.data, file };
  } catch (error) { if (error instanceof CandidateError) throw error; throw invalid(); }
}

export function candidateFailure(error: unknown) {
  const failure = error instanceof CandidateError ? error : new CandidateError(503, "UNAVAILABLE", "Could not load or save the image candidate. Keep your proposal and retry.");
  // Never log filenames, image bytes, user prose, tokens or underlying provider messages.
  console.error("[illustration candidates] request failed", { code: failure.code, status: failure.status });
  return Response.json({ error: failure.message, code: failure.code }, { status: failure.status, headers: privateHeaders });
}
