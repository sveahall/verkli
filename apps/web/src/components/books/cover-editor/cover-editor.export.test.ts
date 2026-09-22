import { afterEach, expect, it, vi } from "vitest";
import { encodeCover } from "./cover-editor.export";
afterEach(() => vi.unstubAllGlobals());
it.each(["png", "jpeg"] as const)("encodes a real %s file with the matching extension", async (format) => {
  const operations: string[] = [];
  const context = { fillStyle: "", fillRect: () => operations.push("background"), drawImage: () => operations.push("image") };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback: (blob: Blob) => void, mime: string) => callback(new Blob(["image"], { type: mime })) };
  vi.stubGlobal("document", { createElement: () => canvas });
  const file = await encodeCover({} as HTMLImageElement, 800, 1200, "none", format);
  expect(file.type).toBe(`image/${format}`);
  expect(file.name).toBe(format === "jpeg" ? "cover-edited.jpg" : "cover-edited.png");
  expect(canvas.width).toBe(800);
  expect(canvas.height).toBe(1200);
  expect(operations).toEqual(format === "jpeg" ? ["background", "image"] : ["image"]);
});
it("reports an unavailable canvas without saving", async () => {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  await expect(encodeCover({} as HTMLImageElement, 800, 1200, "none", "png")).rejects.toThrow("Canvas");
});
it("reports an encoding failure instead of returning an empty file", async () => {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (callback: (blob: null) => void) => callback(null) }) });
  await expect(encodeCover({} as HTMLImageElement, 800, 1200, "none", "png")).rejects.toThrow("encode");
});
