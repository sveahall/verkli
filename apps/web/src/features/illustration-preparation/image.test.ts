import { afterEach, expect, it, vi } from "vitest";
import { exportCrop, loadSource, renderCrop, type PreparedSource } from "./image";
import type { CropSettings } from "./geometry";

const settings: CropSettings = { aspect: "square", zoom: 1, x: 100, y: 50 };
const create = vi.fn(() => "blob:local");
const revoke = vi.fn();
let last: { onload: (() => void) | null; onerror: (() => void) | null; naturalWidth: number; naturalHeight: number; src: string };

function chunk(type: string, data = new Uint8Array()) {
  const bytes = new Uint8Array(data.length + 12);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  return bytes;
}
function png(width = 400, height = 200, animated = false) {
  const dimensions = new Uint8Array(13);
  new DataView(dimensions.buffer).setUint32(0, width);
  new DataView(dimensions.buffer).setUint32(4, height);
  return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", dimensions), ...(animated ? [chunk("acTL", new Uint8Array(8))] : []), chunk("IDAT", new Uint8Array([1])), chunk("IEND")], "source.png", { type: "image/png" });
}
function browser() {
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  vi.stubGlobal("Image", class {
    onload = null; onerror = null; naturalWidth = 400; naturalHeight = 200; src = "";
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Expose explicit browser load/error events.
    constructor() { last = this; }
  });
}
async function pendingLoad(file = png(), signal?: AbortSignal) {
  const pending = loadSource(file, signal);
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  return { pending };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("rejects unsupported MIME, mismatched signatures, empty and oversized files before allocation", async () => {
  browser();
  for (const file of [new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }), new File(["fake"], "x.png", { type: "image/png" }), new File([await png().arrayBuffer()], "x.jpg", { type: "image/jpeg" }), new File([], "x.png", { type: "image/png" }), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.png", { type: "image/png" })]) {
    await expect(loadSource(file)).rejects.toThrow();
  }
  expect(create).not.toHaveBeenCalled();
});

it("rejects excessive PNG dimensions and animation before browser decoding", async () => {
  browser();
  for (const file of [png(20001, 1), png(10000, 5000), png(0, 1), png(400, 200, true)]) await expect(loadSource(file)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});

it("reads JPEG frame dimensions before decoding", async () => {
  browser();
  const jpeg = new File([new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 1, 78, 33, 1, 1, 17, 0, 255, 217])], "large.jpg", { type: "image/jpeg" });
  await expect(loadSource(jpeg)).rejects.toThrow("dimensions");
  expect(create).not.toHaveBeenCalled();
});

it("accepts JPEG metadata and keeps browser-oriented dimensions", async () => {
  browser();
  const jpeg = new File([new Uint8Array([255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, 255, 194, 0, 11, 8, 0, 200, 1, 144, 1, 1, 17, 0, 255, 217])], "portrait.jpg", { type: "image/jpeg" });
  const { pending } = await pendingLoad(jpeg);
  last.naturalWidth = 200;
  last.naturalHeight = 400;
  last.onload?.();
  const source = await pending;
  expect(source).toMatchObject({ width: 200, height: 400 });
  source.dispose();
});

it("rejects malformed or excessive headers without creating an image", async () => {
  browser();
  const bytes = new Uint8Array(await png().arrayBuffer());
  new DataView(bytes.buffer).setUint32(33, 0xffffffff);
  const oversizedMetadata = new Uint8Array(256 * 1024 + 64);
  oversizedMetadata.set([255, 216]);
  for (const offset of [2, 65539, 131076, 196613]) oversizedMetadata.set([255, 225, 255, 255], offset);
  for (const file of [new File([bytes], "broken.png", { type: "image/png" }), new File([oversizedMetadata], "metadata.jpg", { type: "image/jpeg" })]) await expect(loadSource(file)).rejects.toThrow("read");
  expect(create).not.toHaveBeenCalled();
});

it("keeps the decoded source until idempotent disposal", async () => {
  browser();
  const { pending } = await pendingLoad();
  last.onload?.();
  const source = await pending;
  expect(source).toMatchObject({ width: 400, height: 200, name: "source.png" });
  expect(revoke).not.toHaveBeenCalled();
  source.dispose(); source.dispose();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:local");
});

it("rejects corrupt decoded content and excessive decoded dimensions, releasing URLs", async () => {
  browser();
  const { pending } = await pendingLoad();
  const rejected = expect(pending).rejects.toThrow("read");
  last.onerror?.();
  await rejected;
  expect(revoke).toHaveBeenCalledOnce();
  create.mockClear(); revoke.mockClear();
  const next = await pendingLoad();
  last.naturalWidth = 20001;
  const invalid = expect(next.pending).rejects.toThrow("dimensions");
  last.onload?.();
  await invalid;
  expect(revoke).toHaveBeenCalledOnce();
});

it("aborts pending decoding and removes callbacks so late completion cannot escape", async () => {
  browser();
  const controller = new AbortController();
  const { pending } = await pendingLoad(png(), controller.signal);
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort();
  await rejected;
  expect(last.onload).toBeNull();
  expect(last.onerror).toBeNull();
  expect(last.src).toBe("");
  expect(revoke).toHaveBeenCalledOnce();
});

it("does not allocate a URL if aborted while headers are being read", async () => {
  browser();
  const controller = new AbortController();
  const pending = loadSource(png(), controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(create).not.toHaveBeenCalled();
});

it("releases the source if cancellation follows the load event before delivery", async () => {
  browser();
  const controller = new AbortController();
  const { pending } = await pendingLoad(png(), controller.signal);
  last.onload?.();
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(revoke).toHaveBeenCalledOnce();
});

function canvas() {
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const element = { width: 0, height: 0, getContext: () => context, toBlob: vi.fn((callback: BlobCallback, type: string) => callback(new Blob(["pixels"], { type }))) };
  vi.stubGlobal("document", { createElement: () => element });
  const source = { image: {} as HTMLImageElement, width: 400, height: 200, name: "source.png", dispose: vi.fn() };
  return { context, element, source };
}

it("uses the exact preview crop for export and only fills JPEG with white", async () => {
  const { context, element, source } = canvas();
  renderCrop(element as unknown as HTMLCanvasElement, source, settings, "png");
  expect([element.width, element.height]).toEqual([200, 200]);
  expect(context.drawImage).toHaveBeenCalledWith(source.image, 200, 0, 200, 200, 0, 0, 200, 200);
  expect(context.fillRect).not.toHaveBeenCalled();
  const result = await exportCrop(source, settings, "jpeg");
  expect(result.type).toBe("image/jpeg");
  expect(context.fillStyle).toBe("#ffffff");
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 200);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it("rejects empty and incorrect encoder results", async () => {
  const { element, source } = canvas();
  element.toBlob.mockImplementationOnce((callback) => callback(null));
  await expect(exportCrop(source, settings, "png")).rejects.toThrow("export");
  element.toBlob.mockImplementationOnce((callback) => callback(new Blob(["wrong"], { type: "image/webp" })));
  await expect(exportCrop(source as PreparedSource, settings, "jpeg")).rejects.toThrow("export");
});
