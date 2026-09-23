import { expect, it } from "vitest";
import { readCandidateBody } from "./http";
import { MAX_IMAGE_BYTES } from "./service";
const intent = { requestId: "00000000-0000-4000-8000-000000000009", expectedChapterVersion: 4, alt: "Harbour", placement: "icon", styleSnapshot: { name: "Sea", medium: "Ink", palette: "Blue" } };
function body() { const data = new FormData(); data.set("intent", JSON.stringify(intent)); data.set("file", new File(["bytes"], "boat.png", { type: "image/png" })); return data; }
function request(data: FormData) { return new Request("http://localhost/upload", { method: "POST", body: data }); }
it("accepts only one file and one bounded strict intent", async () => {
  const result = await readCandidateBody(request(body())); expect(result.intent).toEqual(intent); expect(result.file.type).toBe("image/png");
});
it.each(["file", "intent", "ownerId"])("rejects extra or duplicate multipart %s", async (field) => {
  const data = body(); data.append(field, "forged"); await expect(readCandidateBody(request(data))).rejects.toMatchObject({ status: 400 });
});
it("rejects caller-controlled metadata or malformed JSON", async () => {
  const data = body(); data.set("intent", JSON.stringify({ ...intent, path: "other/private.png" }));
  await expect(readCandidateBody(request(data))).rejects.toMatchObject({ status: 400 });
  data.set("intent", "{"); await expect(readCandidateBody(request(data))).rejects.toMatchObject({ status: 400 });
});
it("bounds a streaming body with no content length and cancels it", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const upload = new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: stream, duplex: "half" } as RequestInit);
  await expect(readCandidateBody(upload)).rejects.toMatchObject({ status: 413 }); expect(cancelled).toBe(true);
});
it("rejects an oversized declared body before reading", async () => {
  const upload = new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(MAX_IMAGE_BYTES + 20_000) }, body: "x" });
  await expect(readCandidateBody(upload)).rejects.toMatchObject({ status: 413 });
});
