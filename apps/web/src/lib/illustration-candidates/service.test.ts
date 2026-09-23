import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";
import { CandidateService, type CandidatePorts, type AssetRow, type Scope } from "./service";
import type { CandidateIntent } from "@/features/illustration-candidates/contracts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = { bookId: id(1), editionId: id(2), chapterId: id(3) };
const intent = (n = 9): CandidateIntent => ({ requestId: id(n), expectedChapterVersion: 4, alt: "A boat", placement: "half-page", styleSnapshot: { name: "Sea", medium: "Ink", palette: "Blue" } });
async function png() { return new File([await sharp({ create: { width: 8, height: 6, channels: 3, background: "navy" } }).png().toBuffer()], "boat.png", { type: "image/png" }); }
function setup() {
  let scope: Scope | null = { ...key, ownerId: id(4), chapterVersion: 4, chapterTitle: "Harbour" };
  const rows = new Map<string, AssetRow>(); const blobs = new Map<string, Buffer>();
  const ports: CandidatePorts = {
    authorize: vi.fn(async () => scope ? { ...scope } : null), ready: vi.fn(async () => true),
    find: vi.fn(async (_scope, assetId) => rows.get(assetId) ?? null), list: vi.fn(async () => [...rows.values()].filter((row) => row.status === "completed")),
    nextVersion: vi.fn(async () => Math.max(0, ...[...rows.values()].map((row) => row.version)) + 1),
    reserve: vi.fn(async (row) => { if (rows.has(row.id) || [...rows.values()].some((item) => item.version === row.version)) return null; const next = { ...row, created_at: "2026-09-22T12:00:00.000Z" }; rows.set(row.id, next); return next; }),
    complete: vi.fn(async (_scope, assetId) => { const row = rows.get(assetId); if (!row || row.status !== "pending") return null; row.status = "completed"; return row; }),
    upload: vi.fn(async (path, bytes) => { if (!blobs.has(path)) blobs.set(path, bytes); }), download: vi.fn(async (path) => blobs.get(path) ?? null),
  };
  return { ports, rows, blobs, service: new CandidateService(ports, id(4), key), deny: () => { scope = null; }, change: () => { if (scope) scope.chapterVersion += 1; } };
}
it("saves one private candidate and replays identical intent without duplicate upload", async () => {
  const { service, ports, rows } = setup(); const file = await png();
  const first = await service.save(intent(), file);
  expect(await service.save(intent(), file)).toEqual(first);
  expect(rows.size).toBe(1); expect(ports.upload).toHaveBeenCalledTimes(1);
  expect([...rows.values()][0]).toMatchObject({ visibility: "private", content_type: "image", channel: "generic", status: "completed" });
});
it.each(["unknown", "public"])("fails closed for %s readiness before any storage or row write", async () => {
  const f = setup(); vi.mocked(f.ports.ready).mockResolvedValue(false);
  await expect(f.service.save(intent(), await png())).rejects.toMatchObject({ status: 503 });
  expect(f.ports.reserve).not.toHaveBeenCalled(); expect(f.ports.upload).not.toHaveBeenCalled();
});
it("rejects inaccessible scope before even probing storage", async () => {
  const f = setup(); f.deny();
  await expect(f.service.list()).rejects.toMatchObject({ status: 404 });
  expect(f.ports.ready).not.toHaveBeenCalled();
});
it("rejects stale source and conflicting retry without changing an earlier candidate", async () => {
  const f = setup(); const file = await png(); const original = await f.service.save(intent(), file);
  await expect(f.service.save({ ...intent(), alt: "Different intent" }, file)).rejects.toMatchObject({ status: 409 });
  f.change(); await expect(f.service.save(intent(10), file)).rejects.toMatchObject({ status: 409 });
  expect(f.rows.size).toBe(1); expect((await f.service.list()) as object).toMatchObject({ scope: { chapterVersion: 5 }, candidates: [original] });
});
it("keeps previous result when upload fails and resumes the same pending ID", async () => {
  const f = setup(); const file = await png(); const first = await f.service.save(intent(), file);
  vi.mocked(f.ports.upload).mockRejectedValueOnce(new Error("upload failure"));
  await expect(f.service.save(intent(10), file)).rejects.toMatchObject({ status: 503 });
  expect((await f.service.list()) as object).toMatchObject({ candidates: [first] });
  await f.service.save(intent(10), file); expect(f.rows.size).toBe(2);
});
it("does not complete an upload after its chapter changed", async () => {
  const f = setup(); const upload = f.ports.upload;
  f.ports.upload = vi.fn(async (...args: Parameters<CandidatePorts["upload"]>) => { await upload(...args); f.change(); });
  await expect(f.service.save(intent(), await png())).rejects.toMatchObject({ status: 409 });
  expect(f.ports.complete).not.toHaveBeenCalled(); expect((await f.service.list()) as object).toMatchObject({ candidates: [] });
});
it("does not trust mutable metadata for an object path or scope", async () => {
  const f = setup(); await f.service.save(intent(), await png());
  const row = f.rows.get(id(9))!;
  row.metadata = { ...(row.metadata as object), path: "another-owner/private.png" };
  vi.mocked(f.ports.download).mockClear();
  await expect(f.service.image(id(9))).rejects.toMatchObject({ status: 404 });
  expect(f.ports.download).not.toHaveBeenCalled();
});
it("rejects a tampered image even at an otherwise valid owned path", async () => {
  const f = setup(); await f.service.save(intent(), await png());
  for (const path of f.blobs.keys()) f.blobs.set(path, Buffer.from("not the original"));
  await expect(f.service.image(id(9))).rejects.toMatchObject({ status: 503 });
});
it.each(["image/svg+xml", "image/jpeg"])("fully validates bytes and MIME %s before reserve", async (mime) => {
  const f = setup(); await expect(f.service.save(intent(), new File([await (await png()).arrayBuffer()], "wrong", { type: mime }))).rejects.toMatchObject({ status: 400 });
  expect(f.ports.reserve).not.toHaveBeenCalled();
});
it("rejects corrupt bytes and invalid alt text without writes", async () => {
  const f = setup(); await expect(f.service.save(intent(), new File(["broken"], "bad.png", { type: "image/png" }))).rejects.toMatchObject({ status: 400 });
  await expect(f.service.save({ ...intent(), alt: " " }, await png())).rejects.toMatchObject({ status: 400 });
  expect(f.ports.reserve).not.toHaveBeenCalled();
});
it("bounds global sequence collisions and never uploads an unreserved object", async () => {
  const f = setup(); vi.mocked(f.ports.reserve).mockResolvedValue(null);
  await expect(f.service.save(intent(), await png())).rejects.toMatchObject({ status: 409 });
  expect(f.ports.reserve).toHaveBeenCalledTimes(3); expect(f.ports.upload).not.toHaveBeenCalled();
});
it("reconciles an unknown completion outcome with the same request ID", async () => {
  const f = setup(); const complete = f.ports.complete;
  f.ports.complete = vi.fn(async (...args: Parameters<CandidatePorts["complete"]>) => { await complete(...args); throw new Error("connection lost after commit"); });
  const file = await png(); await expect(f.service.save(intent(), file)).rejects.toThrow("connection lost");
  const saved = await f.service.save(intent(), file);
  expect(saved.id).toBe(id(9)); expect(f.rows.size).toBe(1); expect(f.ports.upload).toHaveBeenCalledTimes(1);
});
it("does not expose bytes if ownership is lost during download", async () => {
  const f = setup(); await f.service.save(intent(), await png()); const download = f.ports.download;
  f.ports.download = vi.fn(async (path) => { const bytes = await download(path); f.deny(); return bytes; });
  await expect(f.service.image(id(9))).rejects.toMatchObject({ status: 404 });
});
it("rejects a same ID with different image bytes before upload", async () => {
  const f = setup(); await f.service.save(intent(), await png());
  const different = new File([await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer()], "same.png", { type: "image/png" });
  await expect(f.service.save(intent(), different)).rejects.toMatchObject({ status: 409 }); expect(f.ports.upload).toHaveBeenCalledTimes(1);
});
it("rejects PNG animation control even when the decoder reports only the first frame", async () => {
  const bytes = Buffer.from(await (await png()).arrayBuffer());
  const control = Buffer.alloc(20); control.writeUInt32BE(8, 0); control.write("acTL", 4); control.writeUInt32BE(2, 8); control.writeUInt32BE(crc32(control.subarray(4, 16)), 16);
  const animated = Buffer.concat([bytes.subarray(0, 33), control, bytes.subarray(33)]);
  const f = setup(); await expect(f.service.save(intent(), new File([animated], "animated.png", { type: "image/png" }))).rejects.toMatchObject({ status: 400 });
  expect(f.ports.reserve).not.toHaveBeenCalled();
});
