import { afterEach, expect, it, vi } from "vitest";
import { loadLocalImage } from "./local-image";
let last: { onload: (() => void) | null; onerror: (() => void) | null; naturalWidth: number; naturalHeight: number };
const revoke = vi.fn();
function browser() {
  vi.stubGlobal("URL", { createObjectURL: () => "blob:preview", revokeObjectURL: revoke });
  vi.stubGlobal("Image", class {
    onload = null; onerror = null; naturalWidth = 640; naturalHeight = 480;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Capture the browser Image test double for explicit load/error events.
    constructor() { last = this; }
    set src(_value: string) { /* explicit completion in tests */ }
  });
}
afterEach(() => { vi.unstubAllGlobals(); revoke.mockClear(); });
it("rejects unsupported and oversized files without allocating URLs", async () => {
  browser();
  await expect(loadLocalImage(new File(["text"], "fake.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG or JPEG");
  await expect(loadLocalImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }))).rejects.toThrow("10 MB");
  expect(revoke).not.toHaveBeenCalled();
});
it("keeps a decoded preview until it is disposed, exactly once", async () => {
  browser();
  const pending = loadLocalImage(new File(["test"], "image.png", { type: "image/png" }));
  last.onload?.();
  const image = await pending;
  expect([image.width, image.height]).toEqual([640, 480]);
  expect(revoke).not.toHaveBeenCalled();
  image.dispose(); image.dispose();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:preview");
});
it("releases a URL when decoding fails", async () => {
  browser();
  const pending = loadLocalImage(new File(["broken"], "broken.png", { type: "image/png" }));
  const rejected = expect(pending).rejects.toThrow("could not be read");
  last.onerror?.();
  await rejected;
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:preview");
});
it("aborts pending decoding and releases its URL", async () => {
  browser();
  const controller = new AbortController();
  const pending = loadLocalImage(new File(["test"], "image.png", { type: "image/png" }), controller.signal);
  const rejected = expect(pending).rejects.toThrow("cancelled");
  controller.abort();
  // Simulate a late browser event so the pre-fix promise cannot hang the test.
  last.onload?.();
  await rejected;
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:preview");
});
