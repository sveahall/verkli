import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const encode = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audiobook/export-fixture", () => ({ createSyntheticExport: encode }));
const { POST } = await import("./route");
const request = (body: unknown = { format: "m4b", scenario: "complete" }) => new Request("http://localhost/api/dev/audio-export", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); encode.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe("synthetic audio export endpoint", () => {
  it.each(["production", "test"])("never invokes encoder in %s", async (env) => {
    vi.stubEnv("NODE_ENV", env); expect((await POST(request())).status).toBe(404); expect(encode).not.toHaveBeenCalled();
  });
  it("rejects arbitrary input paths and unsupported formats", async () => {
    expect((await POST(request({ format: "m4b", scenario: "complete", path: "/private/file" }))).status).toBe(400);
    expect((await POST(request({ format: "wav", scenario: "complete" }))).status).toBe(400);
    expect(encode).not.toHaveBeenCalled();
  });
  it("publishes binary only after successful encoding and verification", async () => {
    encode.mockResolvedValue({ audio: Buffer.from("synthetic-encoded"), contentType: "audio/mp4", extension: "m4b", durationSeconds: 9.875, chapters: [{}, {}, {}] });
    const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("audio/mp4"); expect(response.headers.get("X-Export-Chapters")).toBe("3");
    expect(await response.text()).toBe("synthetic-encoded");
  });
  it("returns no download after encoding fails", async () => {
    encode.mockRejectedValue(new Error("The local audio tool failed."));
    const response = await POST(request()); expect(response.status).toBe(422);
    expect(response.headers.get("Content-Disposition")).toBeNull(); expect((await response.json()).error).toContain("failed");
  });
  it("rejects oversized payload before invoking the encoder", async () => {
    expect((await POST(request({ format: "m4b", scenario: "complete", extra: "x".repeat(1000) }))).status).toBe(400);
    expect(encode).not.toHaveBeenCalled();
  });
  it("holds the encoder slot until completion and releases it after failure", async () => {
    let fail!: (reason: Error) => void;
    encode.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const first = POST(request());
    await vi.waitFor(() => expect(encode).toHaveBeenCalledTimes(1));
    expect((await POST(request())).status).toBe(429);
    expect((await POST(request())).status).toBe(429);
    expect(encode).toHaveBeenCalledTimes(1);
    fail(new Error("Local encoding failed."));
    expect((await first).status).toBe(422);
    encode.mockResolvedValue({ audio: Buffer.from("synthetic-encoded"), contentType: "audio/mp4", extension: "m4b", durationSeconds: 9.875, chapters: [{}, {}, {}] });
    expect((await POST(request())).status).toBe(200);
    expect(encode).toHaveBeenCalledTimes(2);
  });
});
