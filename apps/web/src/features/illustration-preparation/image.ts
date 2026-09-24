import { calculateCrop, validateDimensions, type CropSettings } from "./geometry";

export type PreparedSource = { image: HTMLImageElement; width: number; height: number; name: string; dispose(): void };

const unreadable = () => new Error("The image could not be read. Choose another PNG or JPEG.");
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Image reading was cancelled.");
}

async function inspectHeaders(file: File, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image between 1 byte and 10 MB.");
  const header = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  checkAbort(signal);
  if (file.type === "image/png") {
    if (header.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) throw unreadable();
    const view = new DataView(header.buffer);
    if (view.getUint32(8) !== 13 || String.fromCharCode(...header.slice(12, 16)) !== "IHDR") throw unreadable();
    validateDimensions(view.getUint32(16), view.getUint32(20));
    let offset = 33;
    let hasPixels = false;
    // Inspect only chunk headers; skip compressed pixels without allocating them.
    for (let count = 0; count < 4096 && offset + 12 <= file.size; count++) {
      const bytes = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      checkAbort(signal);
      const length = new DataView(bytes.buffer).getUint32(0);
      const type = String.fromCharCode(...bytes.slice(4, 8));
      if (offset + length + 12 > file.size) throw unreadable();
      if (type === "acTL") throw new Error("Animated PNG images are not supported. Choose a still PNG or JPEG.");
      if (type === "IDAT") hasPixels = true;
      if (type === "IEND") {
        if (length !== 0 || !hasPixels) throw unreadable();
        return;
      }
      offset += length + 12;
    }
    throw unreadable();
  }
  if (header[0] !== 255 || header[1] !== 216 || header[2] !== 255) throw unreadable();
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  checkAbort(signal);
  const view = new DataView(bytes.buffer);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) throw unreadable();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218 || offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) throw unreadable();
      validateDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      return;
    }
    offset += length;
  }
  throw new Error("The JPEG header could not be read within 256 KB. Choose another image.");
}

export async function loadSource(file: File, signal?: AbortSignal): Promise<PreparedSource> {
  await inspectHeaders(file, signal);
  checkAbort(signal);
  const url = URL.createObjectURL(file);
  let released = false;
  const dispose = () => { if (!released) { released = true; URL.revokeObjectURL(url); } };
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { signal?.removeEventListener("abort", abort); image.onload = null; image.onerror = null; };
      const abort = () => { cleanup(); image.src = ""; dispose(); reject(new Error("Image reading was cancelled.")); };
      signal?.addEventListener("abort", abort, { once: true });
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(unreadable()); };
      image.src = url;
      if (signal?.aborted) abort();
    });
    checkAbort(signal);
    // Browser decoding applies JPEG EXIF orientation; use its dimensions without rotating again.
    validateDimensions(image.naturalWidth, image.naturalHeight);
    return { image, width: image.naturalWidth, height: image.naturalHeight, name: file.name, dispose };
  } catch (error) { dispose(); throw error; }
}

export function renderCrop(canvas: HTMLCanvasElement, source: PreparedSource, settings: CropSettings, format: "png" | "jpeg"): void {
  const crop = calculateCrop(source.width, source.height, settings);
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The image preview could not be created. Try again in another browser.");
  if (format === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, crop.width, crop.height);
  }
  context.drawImage(source.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.width, crop.height);
}

export async function exportCrop(source: PreparedSource, settings: CropSettings, format: "png" | "jpeg"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  renderCrop(canvas, source, settings, format);
  const type = `image/${format}`;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || !blob.size || blob.type !== type) reject(new Error("The image export failed. Try again or choose another format."));
      else resolve(blob);
    }, type, 0.92);
  });
}
