import { afterEach, describe, expect, it, vi } from "vitest";
const { exported, preview } = vi.hoisted(() => ({ exported: vi.fn(), preview: vi.fn() }));
vi.mock("./private-export-service", () => ({ exportPrivateAudio: exported, loadPrivateExportPreview: preview }));
import { createPrivateExportHandlers } from "./private-export-handler";
import type { PrivateExportDependencies } from "./private-export-service";
const handlers = createPrivateExportHandlers({} as PrivateExportDependencies);
const ctx = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) };
const input = { editionId: "00000000-0000-4000-8000-000000000003", format: "m4b", snapshotId: "a".repeat(64) };
const output = { audio: Buffer.from("synthetic-output"), contentType: "audio/mp4", extension: "m4b", durationSeconds: 2, chapters: [{}, {}] };
afterEach(() => vi.resetAllMocks());
describe("private export HTTP publication", () => {
  it("publishes binary with private/no-store headers only on success", async () => { exported.mockResolvedValue(output); const response = await handlers.POST(new Request("http://localhost/export", { method: "POST", body: JSON.stringify(input) }), ctx); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(await response.text()).toBe("synthetic-output"); });
  it.each(["POST", "GET"] as const)("never publishes %s after cancellation during final cleanup", async (method) => {
    const controller = new AbortController();
    exported.mockImplementation(async () => { controller.abort(); return output; }); preview.mockImplementation(async () => { controller.abort(); return { snapshotId: "secret" }; });
    const response = await handlers[method](new Request(`http://localhost/export?editionId=${input.editionId}`, { method, signal: controller.signal, ...(method === "POST" ? { body: JSON.stringify(input) } : {}) }), ctx);
    expect(response.status).toBe(499); expect(response.headers.get("Content-Disposition")).toBeNull(); expect(await response.text()).not.toContain("synthetic-output");
  });
  it("rejects oversized and client path payloads before any source reads", async () => {
    for (const body of [{ ...input, path: "/private" }, { ...input, extra: "x".repeat(3000) }]) expect((await handlers.POST(new Request("http://localhost/export", { method: "POST", body: JSON.stringify(body) }), ctx)).status).toBe(body.extra ? 413 : 400);
    expect(exported).not.toHaveBeenCalled();
  });
  it("sanitizes unknown errors without exposing references", async () => { exported.mockRejectedValue(new Error("private/path signed-token")); const response = await handlers.POST(new Request("http://localhost/export", { method: "POST", body: JSON.stringify(input) }), ctx); expect(response.status).toBe(500); expect(await response.text()).not.toContain("signed-token"); expect(response.headers.get("Content-Disposition")).toBeNull(); });
  it("cancels and releases a pre-aborted request body", async () => {
    const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ cancel });
    const controller = new AbortController(); controller.abort();
    const request = new Request("http://localhost/export", { method: "POST", body: stream, signal: controller.signal, duplex: "half" } as RequestInit);
    expect((await handlers.POST(request, ctx)).status).toBe(499); expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(exported).not.toHaveBeenCalled();
  });
});
