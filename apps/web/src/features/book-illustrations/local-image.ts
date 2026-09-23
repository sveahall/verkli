import type { IllustrationImageLoader } from "./contracts";

export const loadLocalImage: IllustrationImageLoader = async (file, signal) => {
  if (signal?.aborted) throw new Error("Image reading was cancelled.");
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image between 1 byte and 10 MB.");
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
      image.onerror = () => { cleanup(); reject(new Error("The image could not be read. Choose another PNG or JPEG.")); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Choose an image with valid dimensions, up to 40 megapixels.");
    return { file, width: image.naturalWidth, height: image.naturalHeight, url, dispose };
  } catch (error) { dispose(); throw error; }
};
